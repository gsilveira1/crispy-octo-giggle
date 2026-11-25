import * as THREE from "three";
import type { Player } from "../world/player";
import { Enemy, KINDS } from "./enemies";
import { FloatingText, Particles } from "./fx";

/**
 * Habilidades provisórias do Cavaleiro (corpo a corpo, rápido e móvel — issue #17).
 * As habilidades definitivas das 5 classes saem da issue #20; aqui é só para sentir o combate.
 * Todas miram no ponteiro do mouse. Usadas logo depois de um golpe que acertou, saem "encadeadas" (mais fortes).
 */
type Skill = { key: string; name: string; icon: string; cd: number; desc: string; chain: string };
const SKILLS: Skill[] = [
  { key: "1", name: "Talho", icon: "⚔", cd: 4, desc: "Golpe forte à frente (25 de dano)", chain: "crítico garantido e +50%" },
  { key: "2", name: "Investida", icon: "➤", cd: 8, desc: "Avança até 9 m na direção do mouse, 14 de dano e atordoa 1,5 s", chain: "acerta todas no caminho e atordoa 2,5 s" },
  { key: "3", name: "Redemoinho", icon: "✺", cd: 7, desc: "Gira o facão: 18 de dano em todos a até 3,5 m", chain: "gira duas vezes" },
  { key: "4", name: "Chimarrão", icon: "☕", cd: 20, desc: "Recupera 40 de vida", chain: "recupera 60" },
];

/** Golpes do mouse: E = botão esquerdo, D = botão direito. A sequência decide o golpe. */
type Move = {
  name: string;
  anim: "slash1" | "slash2" | "slash3" | "spin" | "charge";
  /** Tempo travado no golpe (s) e instante do impacto (s). */
  lock: number;
  at: number;
  dmg: number;
  range: number;
  /** Meia abertura do arco, em graus (180 = em volta). */
  arc: number;
  knock: number;
  stagger?: number;
  /** Passo à frente durante o golpe (m). */
  step?: number;
  /** Centro da área à frente do jogador (m), para golpes de chão. */
  ahead?: number;
  finisher?: boolean;
};
const MOVES: Record<string, Move> = {
  E: { name: "", anim: "slash1", lock: 0.28, at: 0.12, dmg: 9, range: 2.7, arc: 65, knock: 2, step: 0.35 },
  EE: { name: "", anim: "slash2", lock: 0.28, at: 0.12, dmg: 9, range: 2.7, arc: 65, knock: 2, step: 0.35 },
  EEE: { name: "Arremate", anim: "slash3", lock: 0.45, at: 0.2, dmg: 16, range: 2.9, arc: 60, knock: 5, stagger: 0.4, step: 0.5, finisher: true },
  D: { name: "Golpe pesado", anim: "slash3", lock: 0.55, at: 0.26, dmg: 17, range: 3, arc: 50, knock: 5, stagger: 0.45, step: 0.3 },
  ED: { name: "Estocada", anim: "charge", lock: 0.42, at: 0.14, dmg: 15, range: 3.6, arc: 25, knock: 4, step: 2.4, finisher: true },
  EED: { name: "Talho cruzado", anim: "spin", lock: 0.5, at: 0.18, dmg: 21, range: 3, arc: 110, knock: 7, stagger: 0.5, finisher: true },
  DE: { name: "Rasteira", anim: "slash2", lock: 0.36, at: 0.14, dmg: 8, range: 2.6, arc: 70, knock: 1, stagger: 1.1, finisher: true },
  DD: { name: "Golpe de terra", anim: "slash3", lock: 0.7, at: 0.32, dmg: 23, range: 2.6, arc: 180, knock: 6, stagger: 0.8, ahead: 1.6, finisher: true },
};
/** Tempo para emendar o próximo clique na sequência, depois que o golpe termina (s). */
const CHAIN_S = 0.55;
/** Janela para uma habilidade sair encadeada depois de um golpe que acertou (s). */
const LINK_S = 0.9;
const MAX_HP = 120;
const ABALADO_S = 20;

const SPARK = new THREE.Color(1.6, 1.0, 0.45);
const SHADOW = new THREE.Color(0.35, 0.4, 0.6);
const BLOOD = new THREE.Color(1.2, 0.25, 0.15);
const HEAL = new THREE.Color(0.4, 1.4, 0.5);
const DUST = new THREE.Color(0.5, 0.45, 0.4);

/**
 * Combate de ação local (sem servidor ainda): WASD anda, o personagem golpeia na direção do mouse.
 * Botão esquerdo e direito formam combos; 1–4 são habilidades, mais fortes logo depois de um golpe.
 * Morrer manda o jogador de volta ao refúgio, abalado.
 */
export class Combat {
  readonly enemies: Enemy[] = [];
  private group = new THREE.Group();
  /** Ponto do chão sob o ponteiro, atualizado pelo laço principal. */
  readonly aim = new THREE.Vector3();
  /** Última cria atingida: aparece no topo da tela. */
  focus?: Enemy;
  hp = MAX_HP;
  private cds = SKILLS.map(() => 0);
  private abalado = 0;
  private dead = 0;
  private inCombat = 0;
  private reticle: THREE.Mesh;
  private fx: Particles;
  private text: FloatingText;
  private hud: { hp: HTMLElement; hpText: HTMLElement; target: HTMLElement; targetName: HTMLElement; targetHp: HTMLElement; slots: HTMLElement[]; status: HTMLElement; hurt: HTMLElement; combo: HTMLElement };
  private bars = new Map<Enemy, HTMLDivElement>();
  private tmp = new THREE.Vector3();
  /** Pausa curta no impacto (s) e tremor da câmera (m), lidos pelo laço principal. */
  hitStop = 0;
  shake = 0;
  private pending: { t: number; fn: () => void }[] = [];
  /** Sequência de cliques em andamento, trava do golpe atual, clique guardado e janela de emenda. */
  private seq = "";
  private lock = 0;
  private queued?: "E" | "D";
  private chainT = 0;
  private linkT = 0;
  private faceT = 0;
  private comboT = 0;

  constructor(
    private scene: THREE.Scene,
    private player: Player,
    private refuge: THREE.Vector3,
    private isBlocked: (x: number, z: number) => boolean,
  ) {
    scene.add(this.group);
    this.fx = new Particles(scene);
    this.text = new FloatingText(document.getElementById("labels")!);
    const ringTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      g.strokeStyle = "#ffb04a";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(64, 64, 40, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        g.beginPath();
        g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
        g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
        g.stroke();
      }
      return new THREE.CanvasTexture(c);
    })();
    this.reticle = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    scene.add(this.reticle);
    this.hud = this.buildHud();
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const i = SKILLS.findIndex((s) => e.key === s.key);
      if (i >= 0) this.cast(i);
    });
  }

  /** Espalha bandos de 3 a 5 crias (às vezes com uma graúda) em volta do refúgio. */
  spawnPacks(center: THREE.Vector3, packs = 6) {
    let made = 0;
    for (let tries = 0; made < packs && tries < 400; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 45;
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      if (this.isBlocked(x, z)) continue;
      const n = 3 + Math.floor(Math.random() * 3);
      let placed = 0;
      for (let k = 0; k < n * 4 && placed < n; k++) {
        const px = x + (Math.random() - 0.5) * 5;
        const pz = z + (Math.random() - 0.5) * 5;
        if (this.isBlocked(px, pz)) continue;
        const e = new Enemy(placed === 0 && Math.random() < 0.5 ? KINDS.graúda : KINDS.cria, px, pz);
        this.enemies.push(e);
        this.group.add(e.root);
        placed++;
      }
      if (placed) made++;
    }
  }

  get alive() {
    return this.dead <= 0;
  }

  /** Clique de mouse: golpe da sequência (E = esquerdo, D = direito). Se ainda está golpeando, guarda o clique. */
  press(btn: "E" | "D") {
    if (!this.alive || this.player.busy) return;
    if (this.lock > 0) {
      this.queued = btn;
      return;
    }
    this.strike(btn);
  }

  private strike(btn: "E" | "D") {
    // Emenda na sequência se veio a tempo; senão começa outra.
    let seq = this.chainT > 0 ? this.seq + btn : btn;
    if (!MOVES[seq]) seq = btn;
    const mv = MOVES[seq]!;
    this.seq = mv.finisher ? "" : seq;
    this.lock = mv.lock;
    this.chainT = 0;
    this.faceT = mv.lock + 0.4;
    this.inCombat = 4;
    const p = this.player.position;
    const dir = this.aimDir();
    this.player.face(this.tmp.copy(p).add(dir));
    this.player.play(mv.anim);
    if (mv.name) this.showCombo(mv.name);
    if (mv.step) this.dash(dir, mv.step, mv.step > 1);
    this.later(mv.at, () => {
      const center = mv.ahead ? p.clone().addScaledVector(dir, mv.ahead) : p.clone();
      const n = this.hitArc(center, dir, mv.range, mv.arc, mv.dmg, mv.knock, mv.stagger);
      if (mv.ahead) {
        // Golpe de chão: poeira e brilho em roda.
        this.fx.burst(center.clone().setY(0.2), 30, DUST, 5, 0.6, new THREE.Vector3(0, 0.6, 0), 2.5);
        this.fx.burst(center.clone().setY(0.3), 16, SPARK, 6, 0.3, new THREE.Vector3(0, 1, 0), 1.5);
        this.shake = Math.max(this.shake, 0.22);
      }
      if (n === 0 && !mv.ahead) this.fx.burst(center.clone().addScaledVector(dir, 1.6).setY(1), 4, new THREE.Color(0.7, 0.7, 0.8), 2, 0.25);
    });
  }

  /** Direção do jogador até o ponteiro, no chão. */
  private aimDir() {
    const d = new THREE.Vector3().subVectors(this.aim, this.player.position).setY(0);
    if (d.lengthSq() < 0.04) d.set(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    return d.normalize();
  }

  /** Desloca o jogador em linha reta até bater em algo. Devolve a distância andada. */
  private dash(dir: THREE.Vector3, dist: number, dust: boolean) {
    const p = this.player.position;
    const steps = Math.ceil(dist / 0.3);
    let went = 0;
    for (let k = 0; k < steps; k++) {
      const s = Math.min(0.3, dist - went);
      const nx = p.x + dir.x * s;
      const nz = p.z + dir.z * s;
      if (this.isBlocked(nx, nz)) break;
      if (dust && k % 2 === 0) this.fx.burst(new THREE.Vector3(p.x, 0.2, p.z), 3, DUST, 1.5, 0.6);
      p.x = nx;
      p.z = nz;
      went += s;
    }
    return went;
  }

  /** Acerta todas as crias vivas dentro do arco à frente. Devolve quantas acertou. */
  private hitArc(from: THREE.Vector3, dir: THREE.Vector3, range: number, arcDeg: number, dmg: number, knock: number, stagger?: number, crit?: boolean) {
    const cos = Math.cos(THREE.MathUtils.degToRad(arcDeg));
    let n = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = this.tmp.subVectors(e.pos, from).setY(0);
      const len = d.length();
      if (len > range + 0.4 * e.kind.scale) continue;
      if (arcDeg < 180 && len > 0.5 && d.divideScalar(len).dot(dir) < cos) continue;
      this.hit(e, dmg, SPARK, knock, crit);
      if (stagger) e.stagger(stagger);
      n++;
    }
    if (n) this.linkT = LINK_S;
    return n;
  }

  private showCombo(name: string, cls = "") {
    const el = this.hud.combo;
    el.textContent = name;
    el.className = cls;
    el.style.opacity = "1";
    this.comboT = 0.9;
  }

  update(dt: number, camera: THREE.Camera) {
    const p = this.player.position;
    this.shake = Math.max(0, this.shake - dt * 1.2);
    this.pending = this.pending.filter((pn) => {
      pn.t -= dt;
      if (pn.t > 0) return true;
      if (this.alive) pn.fn();
      return false;
    });
    // Fim do golpe: solta o clique guardado ou abre a janela para emendar.
    if (this.lock > 0) {
      this.lock -= dt;
      if (this.lock <= 0) {
        this.lock = 0;
        this.chainT = this.seq ? CHAIN_S : 0;
        const q = this.queued;
        this.queued = undefined;
        if (q && this.alive) this.strike(q);
      }
    } else if (this.chainT > 0) {
      this.chainT -= dt;
      if (this.chainT <= 0) this.seq = "";
    }
    this.linkT = Math.max(0, this.linkT - dt);
    this.faceT = Math.max(0, this.faceT - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.hud.combo.style.opacity = "0";
    // Golpeando, o personagem olha para o mouse; andando, para onde anda.
    this.player.face(this.faceT > 0 && this.alive ? this.aim : undefined);
    this.cds = this.cds.map((c) => Math.max(0, c - dt));
    this.abalado = Math.max(0, this.abalado - dt);
    this.inCombat = Math.max(0, this.inCombat - dt);

    if (this.dead > 0) {
      this.dead -= dt;
      if (this.dead <= 0) this.respawn();
    }

    let chasing = false;
    for (const e of this.enemies) {
      const near = e.pos.distanceToSquared(p) < 90 * 90;
      e.root.visible = near && (e.alive || e.root.visible);
      if (!near && !e.dead) continue;
      if (e.update(dt, p, this.alive, this.isBlocked, (dmg) => this.hurt(dmg))) chasing = true;
    }
    if (chasing) this.inCombat = 4;
    // Fora de combate, a vida volta devagar.
    if (this.alive && this.inCombat <= 0) this.hp = Math.min(MAX_HP, this.hp + dt * 6);
    if (this.focus && (!this.focus.alive || this.focus.pos.distanceTo(p) > 30)) this.focus = undefined;

    // Mira no chão, presa a um raio em volta do jogador.
    this.reticle.visible = this.alive;
    this.reticle.position.set(this.aim.x, 0.06, this.aim.z);
    this.reticle.rotation.y += dt * 1.5;
    this.reticle.scale.setScalar(this.linkT > 0 ? 1.25 : 1);
    (this.reticle.material as THREE.MeshBasicMaterial).color.setHex(this.linkT > 0 ? 0xffe080 : 0xffffff);

    this.fx.update(dt);
    this.text.update(dt, camera);
    this.updateHud(camera);
  }

  /** Agenda o dano para o instante do impacto da animação. */
  private later(t: number, fn: () => void) {
    this.pending.push({ t, fn });
  }

  private hit(e: Enemy, base: number, color = SPARK, knock = 2.5, forceCrit = false) {
    if (!e.alive) return;
    this.focus = e;
    const crit = forceCrit || Math.random() < 0.15;
    const dmg = Math.round(base * (this.abalado > 0 ? 0.7 : 1) * (crit ? 1.6 : 1));
    const killed = e.damage(dmg);
    e.knock(this.tmp.subVectors(e.pos, this.player.position), knock * (crit ? 1.5 : 1));
    this.hitStop = Math.max(this.hitStop, killed || crit ? 0.09 : 0.05);
    this.shake = Math.max(this.shake, killed ? 0.25 : crit ? 0.18 : 0.08);
    this.inCombat = 4;
    const at = e.center;
    this.fx.burst(at, 14, color, 6, 0.4, this.tmp.subVectors(at, this.player.position).setY(0.6).normalize(), 0.8);
    this.fx.burst(at, 6, SHADOW, 2, 0.9);
    this.text.show(crit ? `${dmg}!` : String(dmg), at.setY(at.y + 0.6), crit ? "crit" : "dmg");
    if (killed) {
      this.fx.burst(e.center, 40, SHADOW, 4, 1.4);
      this.fx.burst(e.center, 16, new THREE.Color(1.4, 0.5, 0.2), 5, 0.7);
      this.text.show("dissipou", e.center.setY(2.2), "info", 1.2);
    }
  }

  private hurt(dmg: number) {
    if (!this.alive) return;
    if (this.player.invulnerable) {
      this.text.show("esquivou", this.player.position.clone().setY(2.3), "info", 0.7);
      return;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.player.play("hurt");
    this.shake = Math.max(this.shake, 0.15);
    this.inCombat = 4;
    this.fx.burst(this.player.position.clone().setY(1.2), 8, BLOOD, 3, 0.4);
    this.text.show(`-${dmg}`, this.player.position.clone().setY(2.2), "hurt");
    this.hud.hurt.style.opacity = "1";
    setTimeout(() => (this.hud.hurt.style.opacity = "0"), 120);
    if (this.hp === 0) {
      this.dead = 3;
      this.player.die();
      this.focus = undefined;
      this.seq = "";
      this.queued = undefined;
      this.hud.status.textContent = "Você caiu… voltando ao refúgio";
      this.hud.status.style.opacity = "1";
    }
  }

  private respawn() {
    this.player.position.copy(this.refuge);
    this.player.revive();
    this.hp = MAX_HP * 0.6;
    this.abalado = ABALADO_S;
    this.hud.status.textContent = "Abalado: dano reduzido por 20 s";
    setTimeout(() => (this.hud.status.style.opacity = "0"), 3000);
  }

  private cast(i: number) {
    const s = SKILLS[i]!;
    if (!this.alive || this.player.busy || this.cds[i]! > 0) return;
    const p = this.player.position;
    const dir = this.aimDir();
    // Logo depois de um golpe que acertou, a habilidade sai encadeada.
    const linked = this.linkT > 0;
    this.linkT = 0;
    this.seq = "";
    this.queued = undefined;
    this.cds[i] = s.cd;
    this.inCombat = 4;
    this.faceT = 0.8;
    this.player.face(this.tmp.copy(p).add(dir));
    this.flashSlot(i);
    this.showCombo(linked ? `${s.name} encadeado` : s.name, linked ? "linked" : "");
    if (s.name === "Talho") {
      this.lock = 0.45;
      this.player.play("slash3");
      this.dash(dir, 0.4, false);
      this.later(0.2, () => {
        const n = this.hitArc(p.clone(), dir, 3, 55, linked ? 38 : 25, 6, 0.6, linked);
        if (n) this.fx.burst(p.clone().addScaledVector(dir, 1.8).setY(1.1), 20, new THREE.Color(1.8, 1.4, 0.8), 8, 0.35);
      });
    } else if (s.name === "Investida") {
      // Avança em linha reta na direção do mouse; para na primeira cria (ou passa por todas, encadeada).
      this.lock = 0.4;
      this.player.play("charge");
      const hitSet = new Set<Enemy>();
      let went = 0;
      while (went < 9) {
        const step = this.dash(dir, 0.3, went % 0.6 < 0.3);
        if (step === 0) break;
        went += step;
        let blocked = false;
        for (const e of this.enemies) {
          if (!e.alive || hitSet.has(e) || e.pos.distanceTo(p) > 1.1 * e.kind.scale) continue;
          hitSet.add(e);
          if (!linked) blocked = true;
        }
        if (blocked) break;
      }
      for (const e of hitSet) {
        e.stagger(linked ? 2.5 : 1.5);
        this.hit(e, 14, SPARK, 5);
        this.text.show("atordoada", e.center.setY(2.4), "info");
      }
      if (hitSet.size) this.linkT = LINK_S;
    } else if (s.name === "Redemoinho") {
      this.lock = linked ? 0.85 : 0.42;
      const spin = () => {
        this.player.play("spin");
        this.fx.burst(p.clone().setY(1), 40, new THREE.Color(1.2, 1.1, 1), 7, 0.35, new THREE.Vector3(0, 0.2, 0), 3);
        this.later(0.15, () => this.hitArc(p.clone(), dir, 3.5, 180, 18, 6));
      };
      spin();
      if (linked) this.later(0.42, spin);
    } else if (s.name === "Chimarrão") {
      this.player.play("drink");
      const heal = linked ? 60 : 40;
      this.hp = Math.min(MAX_HP, this.hp + heal);
      this.fx.burst(p.clone().setY(1.2), 24, HEAL, 2.5, 1, new THREE.Vector3(0, 1, 0), 0.5);
      this.text.show(`+${heal}`, p.clone().setY(2.3), "heal");
    }
  }

  private buildHud() {
    const root = document.createElement("div");
    root.id = "combat-hud";
    const combos = Object.entries(MOVES)
      .filter(([, m]) => m.name)
      .map(([k, m]) => `<div><kbd>${k.split("").join("</kbd><kbd>")}</kbd> ${m.name}</div>`)
      .join("");
    root.innerHTML = `
      <div id="hurt"></div>
      <div id="me"><b>Forasteiro · Cavaleiro</b><div class="bar"><i id="hp"></i><span id="hptext"></span></div></div>
      <div id="tgt"><b id="tname"></b><div class="bar enemy"><i id="thp"></i></div></div>
      <div id="status"></div>
      <div id="combo"></div>
      <div id="combos"><b>Golpes</b> <small>E = botão esquerdo · D = direito</small>${combos}<div><kbd>golpe</kbd> + <kbd>1–4</kbd> habilidade encadeada</div></div>
      <div id="bar">${SKILLS.map((s) => `<div class="slot" title="${s.desc}. Encadeada: ${s.chain}."><span class="ico">${s.icon}</span><span class="key">${s.key}</span><span class="nm">${s.name}</span><i class="cd"></i></div>`).join("")}</div>`;
    document.body.appendChild(root);
    const $ = (id: string) => root.querySelector<HTMLElement>(id)!;
    return { hp: $("#hp"), hpText: $("#hptext"), target: $("#tgt"), targetName: $("#tname"), targetHp: $("#thp"), slots: [...root.querySelectorAll<HTMLElement>(".slot")], status: $("#status"), hurt: $("#hurt"), combo: $("#combo") };
  }
  private flashSlot(i: number) {
    const s = this.hud.slots[i]!;
    s.classList.remove("used");
    void s.offsetWidth;
    s.classList.add("used");
  }

  private updateHud(camera: THREE.Camera) {
    const h = this.hud;
    h.hp.style.width = `${(this.hp / MAX_HP) * 100}%`;
    h.hpText.textContent = `${Math.ceil(this.hp)} / ${MAX_HP}${this.abalado > 0 ? " · abalado" : ""}`;
    h.target.style.display = this.focus ? "block" : "none";
    if (this.focus) {
      h.targetName.textContent = this.focus.kind.name;
      h.targetHp.style.width = `${(this.focus.hp / this.focus.kind.hp) * 100}%`;
    }
    SKILLS.forEach((s, i) => {
      const cd = this.cds[i]!;
      const el = h.slots[i]!;
      (el.querySelector(".cd") as HTMLElement).style.setProperty("--p", `${(cd / s.cd) * 360}deg`);
      el.classList.toggle("cooling", cd > 0);
      el.classList.toggle("linked", cd <= 0 && this.linkT > 0);
    });
    // Barrinha de vida em cima das crias feridas ou do alvo.
    for (const e of this.enemies) {
      const show = e.alive && e.root.visible && (e === this.focus || e.hp < e.kind.hp);
      let bar = this.bars.get(e);
      if (!show) {
        if (bar) bar.style.display = "none";
        continue;
      }
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "ehp";
        bar.innerHTML = "<i></i>";
        document.getElementById("labels")!.appendChild(bar);
        this.bars.set(e, bar);
      }
      this.tmp.copy(e.pos).setY(2.0 * e.kind.scale).project(camera);
      bar.style.display = this.tmp.z < 1 ? "block" : "none";
      bar.style.left = `${(this.tmp.x * 0.5 + 0.5) * innerWidth}px`;
      bar.style.top = `${(-this.tmp.y * 0.5 + 0.5) * innerHeight}px`;
      (bar.firstChild as HTMLElement).style.width = `${(e.hp / e.kind.hp) * 100}%`;
      bar.classList.toggle("sel", e === this.focus);
    }
  }
}
