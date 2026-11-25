import * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  CLASS_IDS, CLASS_LABEL, CLASSES, ORIGINS, PHASE_LABEL, characterTitle, classModelId,
  type CharacterProfile, type ClassId, type Gender, type Origin, type TileManifest,
} from "@bigriver/shared";
import { ACTIONS, FIXED_CONTROLS, HUD_LABEL, SettingsStore, keyName, type ActionId, type HudKey, type Settings } from "./settings";
import { CharacterPreview } from "./preview";
import { ScenarioBuilder } from "../editor/builder";
import { loadModel } from "../world/models";
import type { Player } from "../world/player";
import type { Combat } from "../combat/combat";
import type { Survivors } from "../world/npcs";
import type { Chunks3D } from "../world/chunks";
import type { Sky } from "../world/sky";
import "./shell.css";

export type ShellState = "title" | "select" | "playing" | "paused" | "builder";

export type ShellDeps = {
  city: string;
  manifest: TileManifest;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  camera: THREE.PerspectiveCamera;
  moon: THREE.DirectionalLight;
  mist: THREE.Object3D;
  player: Player;
  combat: Combat;
  survivors: Survivors;
  chunks: Chunks3D;
  refuge: THREE.Vector3;
  sky: Sky;
  bigMap: { open: boolean; toggle(): void };
  streetLabels: { visible: boolean };
};

const PROFILE_KEY = "bigriver:character";
const AUTOPLAY_KEY = "bigriver:autoplay";

function loadProfile(): CharacterProfile | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as CharacterProfile | null;
    if (p && CLASS_IDS.includes(p.cls) && (p.gender === "m" || p.gender === "f") && (p.origin === "morador" || p.origin === "forasteiro")) return p;
  } catch {
    // perfil inválido
  }
  return undefined;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Casca do jogo: menu inicial, seleção de personagem, pausa, configurações e builder de cenário.
 * Fica por cima do mundo 3D (que continua desenhando ao fundo) e decide quando o jogo anda.
 * As teclas passam primeiro por aqui (fase de captura): nos menus nada chega ao jogo, e no jogo
 * as teclas trocadas pelo jogador são traduzidas para as teclas padrão.
 */
export class GameShell {
  readonly settings = new SettingsStore();
  readonly builder: ScenarioBuilder;
  state: ShellState = "title";
  profile = loadProfile();
  private root = document.createElement("div");
  private screens: Record<"title" | "select" | "paused" | "settings", HTMLElement>;
  private settingsOpen = false;
  private settingsTab = "graficos";
  private rebinding?: ActionId;
  private started = false;
  private loadedModel?: string;
  private preview = new CharacterPreview();
  private draft: { cls: ClassId; gender: Gender; origin: Origin; name: string };
  private synthetic = false;
  private toastT?: ReturnType<typeof setTimeout>;

  constructor(private d: ShellDeps) {
    this.draft = { cls: this.profile?.cls ?? "cavaleiro", gender: this.profile?.gender ?? "m", origin: this.profile?.origin ?? "forasteiro", name: this.profile?.name ?? "" };
    this.builder = new ScenarioBuilder({
      scene: d.scene,
      city: d.city,
      metersPerTile: d.manifest.metersPerTile,
      camera: () => d.camera,
      canvas: d.renderer.domElement,
      combat: d.combat,
      survivors: d.survivors,
      refuge: d.refuge,
      extraHeights: d.chunks.extraHeights,
      isBlocked: d.chunks.isBlocked,
    });
    this.builder.onClose = () => {
      if (this.state === "builder") this.setState(this.started ? "playing" : "title");
    };
    this.root.id = "shell";
    this.screens = {
      title: this.screen("s-title"),
      select: this.screen("s-select"),
      paused: this.screen("s-pause"),
      settings: this.screen("s-settings"),
    };
    document.body.append(this.root, this.builder.el);
    this.installInput();
    this.settings.onChange((s) => this.applySettings(s));

    const params = new URLSearchParams(location.search);
    let autoplay = params.get("menu") === "0";
    try {
      autoplay ||= sessionStorage.getItem(AUTOPLAY_KEY) === "1";
      sessionStorage.removeItem(AUTOPLAY_KEY);
    } catch {
      // sem sessionStorage
    }
    if (autoplay) this.start(this.profile ?? { name: "", cls: "cavaleiro", gender: "m", origin: "forasteiro", createdAt: Date.now() }, false);
    else this.setState("title");
  }

  // ---------- Estado ----------

  /** O personagem anda (jogando ou montando cenário). */
  get playerActive() {
    return this.state === "playing" || this.state === "builder";
  }

  /** Crias, golpes e habilidades andam. */
  get combatActive() {
    return this.state === "playing";
  }

  /** Câmera girando devagar atrás dos menus iniciais. */
  get orbit() {
    return this.state === "title" || this.state === "select";
  }

  /** Força do tremor da câmera (configuração). */
  get shake() {
    return this.settings.values.shake;
  }

  update(t: number) {
    this.builder.update(t);
  }

  private setState(s: ShellState) {
    this.state = s;
    // Solta as teclas que estavam apertadas, para o personagem não sair andando sozinho.
    dispatchEvent(new Event("blur"));
    document.body.dataset.shell = s;
    if (s === "builder") this.builder.open();
    else if (this.builder.active) {
      this.builder.onClose = undefined;
      this.builder.close();
      this.builder.onClose = () => {
        if (this.state === "builder") this.setState(this.started ? "playing" : "title");
      };
    }
    if (s !== "select") this.preview.stop();
    this.settingsOpen = false;
    this.render();
  }

  private start(p: CharacterProfile, save = true) {
    const id = classModelId(p.cls, p.gender);
    if (save) {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      } catch {
        // sem armazenamento
      }
    }
    // Trocar de personagem com o jogo já andando: recarrega a página direto no jogo.
    if (this.loadedModel && this.loadedModel !== id) {
      try {
        sessionStorage.setItem(AUTOPLAY_KEY, "1");
      } catch {
        // sem sessionStorage
      }
      location.reload();
      return;
    }
    this.profile = p;
    this.started = true;
    const nameEl = document.querySelector("#me b");
    if (nameEl) nameEl.textContent = p.name ? `${p.name} · ${characterTitle(p)}` : characterTitle(p);
    if (!this.loadedModel) {
      this.loadedModel = id;
      loadModel(id, false)
        .then((a) => this.d.player.useModel(a.scene))
        .catch((e) => console.warn("modelo do personagem não carregou; usando o procedural", e));
    }
    this.setState("playing");
    this.toast(p.origin === "morador" ? `${p.name || "Você"} volta às ruas de ${this.d.manifest.name}.` : `${p.name || "Você"} chega a ${this.d.manifest.name}, dias depois da Cerração.`);
  }

  private toast(text: string) {
    let el = document.getElementById("shell-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "shell-toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el!.classList.remove("show"), 3500);
  }

  // ---------- Entrada ----------

  private installInput() {
    const isField = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
    const onKey = (e: KeyboardEvent) => {
      if (this.synthetic) return;
      // Trocando uma tecla nas configurações: a próxima tecla vira a nova.
      if (this.rebinding) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type !== "keydown") return;
        if (e.code !== "Escape") this.settings.bind(this.rebinding, e.code);
        this.rebinding = undefined;
        this.render();
        return;
      }
      if (isField(e.target)) {
        if (e.type === "keydown" && e.code === "Enter" && this.state === "select") this.confirmSelect();
        return;
      }
      const down = e.type === "keydown";
      if (e.code === "Escape") {
        // Com o mapa grande aberto, o Esc é dele.
        if (this.d.bigMap.open) return;
        e.stopImmediatePropagation();
        if (down && !e.repeat) this.back();
        return;
      }
      if (this.state !== "playing" && this.state !== "builder") {
        // Nos menus nada chega ao jogo.
        e.stopImmediatePropagation();
        if (down && e.code === "Enter" && this.state === "select") this.confirmSelect();
        return;
      }
      if (this.state === "builder" && down && this.builder.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const code = this.settings.translate(e.code);
      if (code === "KeyB") {
        e.stopImmediatePropagation();
        if (down && !e.repeat) this.setState(this.state === "builder" ? "playing" : "builder");
        return;
      }
      if (code === e.code) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (code === null) return;
      this.synthetic = true;
      try {
        dispatchEvent(this.settings.synth(down ? "keydown" : "keyup", code, e.repeat));
      } finally {
        this.synthetic = false;
      }
    };
    addEventListener("keydown", onKey, { capture: true });
    addEventListener("keyup", onKey, { capture: true });

    const canvas = this.d.renderer.domElement;
    addEventListener(
      "pointerdown",
      (e) => {
        if (e.target !== canvas) return;
        if (this.state === "builder") {
          e.stopImmediatePropagation();
          this.builder.pointerDown(e);
        } else if (this.state !== "playing") e.stopImmediatePropagation();
      },
      { capture: true },
    );
    addEventListener("pointermove", (e) => {
      if (this.state === "builder" && e.target === canvas) this.builder.pointerMove(e);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing" && this.settings.values.pauseOnBlur) this.setState("paused");
    });
  }

  /** Esc: volta um passo. */
  private back() {
    if (this.settingsOpen) {
      this.settingsOpen = false;
      this.render();
      return;
    }
    if (this.state === "playing") this.setState("paused");
    else if (this.state === "paused") this.setState("playing");
    else if (this.state === "builder") this.setState(this.started ? "playing" : "title");
    else if (this.state === "select") this.setState("title");
  }

  // ---------- Configurações aplicadas ----------

  private applySettings(s: Settings) {
    const d = this.d;
    const pr = Math.min(devicePixelRatio, 2) * s.resolution;
    if (Math.abs(d.renderer.getPixelRatio() - pr) > 1e-3) {
      d.renderer.setPixelRatio(pr);
      d.composer.setPixelRatio(pr);
      d.renderer.setSize(innerWidth, innerHeight);
      d.composer.setSize(innerWidth, innerHeight);
    }
    d.moon.castShadow = s.shadows;
    d.bloom.enabled = s.bloom;
    d.mist.visible = s.mist;
    d.camera.fov = s.fov;
    d.camera.updateProjectionMatrix();
    d.streetLabels.visible = s.hud.streets;
    const cls = document.body.classList;
    for (const k of Object.keys(s.hud) as HudKey[]) cls.toggle(`hide-${k}`, !s.hud[k]);
    cls.toggle("hide-vignette", !s.vignette);
    this.updateHelp();
  }

  /** Reescreve a dica do rodapé com as teclas atuais. */
  private updateHelp() {
    const help = document.getElementById("help");
    if (!help) return;
    const k = (a: ActionId) => `<b>${keyName(this.settings.values.keys[a])}</b>`;
    help.innerHTML =
      `${k("up")}${k("left")}${k("down")}${k("right")}: andar · ${k("run")}: correr · mouse: golpes e combos · ${k("skill1")}–${k("skill4")}: habilidades · ${k("jump")}: pular · ${k("dodge")}: cambalhota · ${k("camLeft")}/${k("camRight")}: girar câmera · roda/${k("zoom")}: zoom` +
      `<br>${k("map")}: mapa da cidade · ${k("streets")}: nomes das ruas · ${k("builder")}: builder de cenário · <b>Esc</b>: pausa e configurações`;
  }

  // ---------- Telas ----------

  private screen(cls: string) {
    const el = document.createElement("section");
    el.className = `screen ${cls}`;
    this.root.appendChild(el);
    return el;
  }

  private render() {
    const showing: keyof typeof this.screens | undefined = this.settingsOpen ? "settings" : this.state === "title" || this.state === "select" || this.state === "paused" ? this.state : undefined;
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle("open", k === showing);
    this.root.classList.toggle("open", !!showing);
    this.root.classList.toggle("dim", showing === "paused" || showing === "settings");
    if (showing === "title") this.renderTitle();
    if (showing === "select") this.renderSelect();
    if (showing === "paused") this.renderPause();
    if (showing === "settings") this.renderSettings();
  }

  private renderTitle() {
    const p = this.profile;
    const el = this.screens.title;
    el.innerHTML = `
      <div class="logo"><small>${esc(this.d.manifest.name)} · Rio Grande do Sul</small><h1>Big River</h1><p>a Cerração</p></div>
      <nav class="menu">
        ${p ? `<button data-a="continue" class="primary">Continuar<small>${esc(p.name || "Sem nome")} · ${characterTitle(p)}</small></button>` : ""}
        <button data-a="new" class="${p ? "" : "primary"}">Novo jogo<small>${p ? "Cria outro personagem (substitui o atual)" : "Escolher classe e origem"}</small></button>
        <button data-a="builder">Builder de cenário<small>Pôr objetos, crias, sobreviventes e luzes no mapa</small></button>
        <button data-a="settings">Configurações<small>Gráficos, interface, câmera e teclas</small></button>
      </nav>
      <footer>Versão de teste · tudo roda só neste navegador, sem servidor ainda</footer>`;
    this.bind(el, {
      continue: () => this.start(this.profile!, false),
      new: () => this.setState("select"),
      builder: () => this.setState("builder"),
      settings: () => this.openSettings(),
    });
  }

  private renderPause() {
    const el = this.screens.paused;
    const p = this.profile;
    el.innerHTML = `
      <div class="panel">
        <h2>Pausado</h2>
        ${p ? `<p class="who">${esc(p.name || "Sem nome")} · ${characterTitle(p)}</p>` : ""}
        <nav class="menu">
          <button data-a="resume" class="primary">Continuar<small>Esc</small></button>
          <button data-a="settings">Configurações</button>
          <button data-a="builder">Builder de cenário<small>${keyName(this.settings.values.keys.builder)}</small></button>
          <button data-a="new">Novo jogo</button>
          <button data-a="title">Menu inicial</button>
        </nav>
        <p class="note">A pausa só existe enquanto o jogo roda sozinho no navegador. No multiplayer o mundo continua; aí esta tela vira só o menu.</p>
      </div>`;
    this.bind(el, {
      resume: () => this.setState("playing"),
      settings: () => this.openSettings(),
      builder: () => this.setState("builder"),
      new: () => this.setState("select"),
      title: () => this.setState("title"),
    });
  }

  private renderSelect() {
    const el = this.screens.select;
    const dr = this.draft;
    if (!el.dataset.built) {
      el.dataset.built = "1";
      el.innerHTML = `
        <header><button data-a="back" class="ghost">← Voltar</button><h2>Escolha seu personagem</h2><span></span></header>
        <div class="sel">
          <ul class="classes">${CLASS_IDS.map((c) => `<li><button data-cls="${c}"><b>${CLASSES[c].name}</b><small>${CLASSES[c].role}</small></button></li>`).join("")}</ul>
          <div class="stage">
            <div class="frame"><div class="spin">Carregando modelo…</div></div>
            <div class="gender"><button data-g="m">Homem</button><button data-g="f">Mulher</button></div>
            <h3 class="cname"></h3>
            <p class="cdesc"></p>
          </div>
          <div class="form">
            <h4>Origem</h4>
            <div class="origins">${(Object.keys(ORIGINS) as Origin[]).map((o) => `<button data-o="${o}"><b>${ORIGINS[o].name}</b><small>${ORIGINS[o].desc}</small></button>`).join("")}</div>
            <h4>Nome</h4>
            <input class="name" maxlength="20" placeholder="Como te chamam em Taquara?" autocomplete="off" spellcheck="false">
            <button data-a="go" class="primary go">Começar</button>
            <p class="note">As habilidades de cada classe ainda são as do Cavaleiro (protótipo de combate); as definitivas saem da issue #20.</p>
          </div>
        </div>`;
      el.querySelector(".frame")!.prepend(this.preview.canvas);
      this.preview.onLoading = (on) => el.querySelector<HTMLElement>(".spin")!.style.display = on ? "grid" : "none";
      this.bind(el, { back: () => this.setState("title"), go: () => this.confirmSelect() });
      el.querySelectorAll<HTMLButtonElement>("[data-cls]").forEach((b) => b.addEventListener("click", () => ((dr.cls = b.dataset.cls as ClassId), this.renderSelect())));
      el.querySelectorAll<HTMLButtonElement>("[data-g]").forEach((b) => b.addEventListener("click", () => ((dr.gender = b.dataset.g as Gender), this.renderSelect())));
      el.querySelectorAll<HTMLButtonElement>("[data-o]").forEach((b) => b.addEventListener("click", () => ((dr.origin = b.dataset.o as Origin), this.renderSelect())));
      const name = el.querySelector<HTMLInputElement>(".name")!;
      name.value = dr.name;
      name.addEventListener("input", () => (dr.name = name.value));
    }
    el.querySelectorAll<HTMLButtonElement>("[data-cls]").forEach((b) => b.classList.toggle("on", b.dataset.cls === dr.cls));
    el.querySelectorAll<HTMLButtonElement>("[data-g]").forEach((b) => {
      b.classList.toggle("on", b.dataset.g === dr.gender);
      b.textContent = CLASS_LABEL[dr.cls][b.dataset.g as Gender];
    });
    el.querySelectorAll<HTMLButtonElement>("[data-o]").forEach((b) => b.classList.toggle("on", b.dataset.o === dr.origin));
    el.querySelector(".cname")!.textContent = `${CLASS_LABEL[dr.cls][dr.gender]} · ${CLASSES[dr.cls].role}`;
    el.querySelector(".cdesc")!.textContent = CLASSES[dr.cls].desc;
    this.preview.start();
    void this.preview.show(classModelId(dr.cls, dr.gender));
  }

  private confirmSelect() {
    const dr = this.draft;
    this.start({ name: dr.name.trim().slice(0, 20), cls: dr.cls, gender: dr.gender, origin: dr.origin, createdAt: Date.now() });
  }

  private openSettings() {
    this.settingsOpen = true;
    this.render();
  }

  private renderSettings() {
    const s = this.settings.values;
    const el = this.screens.settings;
    const tabs: [string, string][] = [["graficos", "Gráficos"], ["interface", "Interface"], ["camera", "Câmera"], ["controles", "Controles"], ["teste", "Teste"]];
    const check = (id: string, label: string, on: boolean, hint = "") =>
      `<label class="row"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="checkbox" data-k="${id}" ${on ? "checked" : ""}></label>`;
    const range = (id: string, label: string, v: number, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<label class="row"><span>${label}</span><input type="range" data-k="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${fmt(v)}</output></label>`;
    let body = "";
    if (this.settingsTab === "graficos") {
      body =
        range("resolution", "Resolução", s.resolution, 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`) +
        check("shadows", "Sombras", s.shadows, "Desligar ajuda em máquinas fracas") +
        check("bloom", "Brilho das luzes (bloom)", s.bloom) +
        check("mist", "Névoa rasteira", s.mist) +
        check("vignette", "Escurecer as bordas da tela", s.vignette);
    } else if (this.settingsTab === "interface") {
      body = (Object.keys(HUD_LABEL) as HudKey[]).map((k) => check(`hud.${k}`, HUD_LABEL[k], k === "streets" ? this.d.streetLabels.visible : s.hud[k])).join("") + check("pauseOnBlur", "Pausar ao trocar de aba", s.pauseOnBlur);
    } else if (this.settingsTab === "camera") {
      body =
        range("fov", "Campo de visão", s.fov, 28, 60, 1, (v) => `${v}°`) +
        range("shake", "Tremor nos impactos", s.shake, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`) +
        `<p class="note">Zoom: roda do mouse (8 m até 1,5 km) ou ${keyName(s.keys.zoom)}. Girar: ${keyName(s.keys.camLeft)} / ${keyName(s.keys.camRight)}.</p>`;
    } else if (this.settingsTab === "controles") {
      const groups = [...new Set(ACTIONS.map((a) => a.group))];
      body =
        `<p class="note">Clique numa tecla e aperte a nova. Se ela já era de outra ação, as duas trocam. Esc cancela.</p>` +
        groups
          .map(
            (g) =>
              `<h4>${g}</h4>` +
              ACTIONS.filter((a) => a.group === g)
                .map((a) => `<div class="row"><span>${a.label}</span><button class="key ${this.rebinding === a.id ? "wait" : ""} ${s.keys[a.id] !== a.code ? "changed" : ""}" data-bind="${a.id}">${this.rebinding === a.id ? "Aperte uma tecla…" : keyName(s.keys[a.id])}</button></div>`)
                .join(""),
          )
          .join("") +
        `<h4>Mouse e fixos</h4>` +
        FIXED_CONTROLS.map(([k, v]) => `<div class="row"><span>${v}</span><kbd>${k}</kbd></div>`).join("") +
        `<button class="ghost wide" data-a="resetKeys">Voltar as teclas ao padrão</button>`;
    } else {
      const sky = this.d.sky;
      const cer = sky.forcedCerracao === null ? "automática" : sky.forcedCerracao ? "ligada" : "desligada";
      body =
        `<p class="note">Atalhos para testar o mundo. O horário é o mesmo para todos (1 h do jogo = 1 min real).</p>` +
        `<div class="row"><span>Fase do dia<small>Agora: ${sky.clockText} · ${PHASE_LABEL[sky.phase]}</small></span><button data-a="phase">Próxima fase (${keyName(s.keys.phase)})</button></div>` +
        `<div class="row"><span>Cerração<small>Agora: ${cer}</small></span><button data-a="cerracao">Trocar (${keyName(s.keys.cerracao)})</button></div>`;
    }
    el.innerHTML = `
      <div class="panel wide">
        <header><h2>Configurações</h2><button data-a="close" class="ghost">Fechar (Esc)</button></header>
        <nav class="tabs">${tabs.map(([id, l]) => `<button data-tab="${id}" class="${id === this.settingsTab ? "on" : ""}">${l}</button>`).join("")}</nav>
        <div class="body">${body}</div>
        <footer><button data-a="resetAll" class="ghost">Restaurar tudo</button><small>Salvo neste navegador</small></footer>
      </div>`;
    this.bind(el, {
      close: () => ((this.settingsOpen = false), this.render()),
      resetKeys: () => this.settings.resetKeys(),
      resetAll: () => this.settings.resetAll(),
      phase: () => (this.d.sky.nextPhase(), this.render()),
      cerracao: () => (this.d.sky.cycleCerracao(), this.render()),
    });
    el.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => ((this.settingsTab = b.dataset.tab!), this.render())));
    el.querySelectorAll<HTMLButtonElement>("[data-bind]").forEach((b) => b.addEventListener("click", () => ((this.rebinding = b.dataset.bind as ActionId), this.render())));
    el.querySelectorAll<HTMLInputElement>("input[data-k]").forEach((inp) => {
      const k = inp.dataset.k!;
      inp.addEventListener(inp.type === "range" ? "input" : "change", () => {
        const v = inp.type === "checkbox" ? inp.checked : Number(inp.value);
        if (k.startsWith("hud.")) this.settings.setHud(k.slice(4) as HudKey, v as boolean);
        else this.settings.set(k as keyof Settings, v as never);
        const out = inp.parentElement?.querySelector("output");
        if (out) out.textContent = k === "fov" ? `${v}°` : `${Math.round((v as number) * 100)}%`;
      });
    });
  }

  private bind(el: HTMLElement, actions: Record<string, () => void>) {
    el.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => {
      const fn = actions[b.dataset.a!];
      if (fn) b.addEventListener("click", fn);
    });
  }
}
