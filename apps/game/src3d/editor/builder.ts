import * as THREE from "three";
import { Scenario, type ScenarioItem, type ScenarioItemKind } from "@bigriver/shared";
import { propKit, lampGlow, tileKey } from "../world/props";
import { radialTexture } from "../world/util";
import { Enemy, KINDS } from "../combat/enemies";
import { loadModel } from "../world/models";
import type { Combat } from "../combat/combat";
import { SURVIVORS as SURVIVOR_MODELS, type Survivors } from "../world/npcs";
import "./builder.css";

/** solid: altura de pisar em cima (m); Infinity = bloqueia e não dá para subir; undefined = não bloqueia. */
type Palette = { kind: ScenarioItemKind; name: string; icon: string; solid?: number; hint: string };

export const PALETTE: Palette[] = [
  { kind: "crate", name: "Caixa", icon: "▣", solid: 0.9, hint: "Caixote de madeira" },
  { kind: "barrel", name: "Barril", icon: "◍", solid: 0.95, hint: "Tambor de óleo" },
  { kind: "barrier", name: "Barreira", icon: "▭", solid: 0.85, hint: "Barreira de concreto listrada" },
  { kind: "car", name: "Carro", icon: "🚗", solid: 1.62, hint: "Carro abandonado" },
  { kind: "tree", name: "Árvore", icon: "🌳", solid: Infinity, hint: "Árvore" },
  { kind: "lamp", name: "Poste", icon: "💡", solid: Infinity, hint: "Poste com luz de verdade" },
  { kind: "fire", name: "Fogo", icon: "🔥", solid: Infinity, hint: "Tambor com fogo (luz que tremula)" },
  { kind: "pack", name: "Bando", icon: "☠", hint: "Bando de crias da Cerração" },
  { kind: "survivor", name: "Sobrevivente", icon: "☺", hint: "NPC sobrevivente parado" },
  { kind: "refuge", name: "Refúgio", icon: "⛺", hint: "Onde o jogador volta ao cair (um só)" },
];

const CAR_COLORS = ["#6d1f1f", "#2c3e57", "#6b6b66", "#c9c4b8", "#1f3b2a", "#7a5a25"];
const MAX_UNDO = 60;

type Placed = { item: ScenarioItem; obj: THREE.Object3D; lights: THREE.PointLight[]; enemies: Enemy[]; npc?: THREE.Object3D; tiles: number[] };

export type BuilderDeps = {
  scene: THREE.Scene;
  city: string;
  metersPerTile: number;
  camera: () => THREE.Camera;
  canvas: HTMLCanvasElement;
  combat: Combat;
  survivors: Survivors;
  /** Refúgio atual (o vetor é o mesmo que o combate usa para o renascimento). */
  refuge: THREE.Vector3;
  extraHeights: Map<number, number>;
  isBlocked: (x: number, z: number) => boolean;
};

/**
 * Builder de cenário dentro do jogo: põe objetos, bandos de crias, sobreviventes, luzes e o refúgio
 * por cima do mapa do OSM. Fica salvo no navegador por cidade e exporta/importa o JSON do
 * schema `Scenario` (packages/shared), que o admin vai publicar para o servidor (issue #10).
 */
export class ScenarioBuilder {
  readonly el = document.createElement("div");
  active = false;
  private group = new THREE.Group();
  private placed = new Map<string, Placed>();
  private kind: ScenarioItemKind = "crate";
  private rot = 0;
  private packCount = 4;
  private survivorModel = SURVIVOR_MODELS[0]!.id;
  private ghost = new THREE.Group();
  private ghostOk = true;
  private pointer = new THREE.Vector2(9, 9);
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private undo: string[] = [];
  private seq = 0;
  private flicker: { light: THREE.PointLight; flame: THREE.Sprite; base: number }[] = [];
  private lamps: THREE.PointLight[] = [];
  private markers = new THREE.Group();
  private hover?: string;
  private name = "Cenário";
  private updatedAt = 0;
  private originalRefuge: THREE.Vector3;
  onClose?: () => void;

  constructor(private d: BuilderDeps) {
    this.originalRefuge = d.refuge.clone();
    d.scene.add(this.group, this.ghost, this.markers);
    this.markers.visible = false;
    this.ghost.visible = false;
    this.el.id = "builder";
    this.buildUi();
    this.load();
  }

  private get storageKey() {
    return `bigriver:scenario:${this.d.city}`;
  }

  // ---------- Ciclo ----------

  open() {
    this.active = true;
    this.el.classList.add("open");
    this.markers.visible = true;
    this.refresh();
  }

  close() {
    this.active = false;
    this.el.classList.remove("open");
    this.markers.visible = false;
    this.ghost.visible = false;
    this.onClose?.();
  }

  /** Teclas do builder (já traduzidas). Devolve true se usou a tecla. */
  key(e: KeyboardEvent): boolean {
    if (e.code === "KeyR") {
      this.rot += (e.shiftKey ? -1 : 1) * (Math.PI / 4);
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
      this.undoLast();
      return true;
    }
    if (e.code === "Delete" || e.code === "Backspace") {
      if (this.hover) this.removeItem(this.hover, true);
      return true;
    }
    const n = e.code.startsWith("Digit") ? Number(e.code.slice(5)) : NaN;
    if (Number.isFinite(n)) {
      const p = PALETTE[(n + 9) % 10];
      if (p) this.select(p.kind);
      return true;
    }
    return false;
  }

  /** Clique no mundo com o builder aberto. */
  pointerDown(e: PointerEvent) {
    this.pointerMove(e);
    if (e.button === 2) {
      if (this.hover) this.removeItem(this.hover, true);
      return;
    }
    if (e.button !== 0 || !this.ghostOk || !this.ghost.visible) return;
    const item: ScenarioItem = { id: this.newId(), kind: this.kind, x: round(this.hit.x), z: round(this.hit.z), rot: round(this.rot, 3) };
    if (this.kind === "pack") item.count = this.packCount;
    if (this.kind === "survivor") item.model = this.survivorModel;
    if (this.kind === "car") item.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.pushUndo();
    if (this.kind === "refuge") for (const p of [...this.placed.values()]) if (p.item.kind === "refuge") this.removeItem(p.item.id, false);
    this.addItem(item);
    this.save();
  }

  pointerMove(e: PointerEvent) {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  }

  /** Chamado a cada quadro pelo laço principal (também fora do builder, para o fogo e as luzes). */
  update(t: number) {
    const glow = lampGlow();
    for (const l of this.lamps) l.intensity = 14 * glow;
    for (const f of this.flicker) {
      const k = 0.75 + Math.sin(t * 13 + f.base) * 0.12 + Math.sin(t * 7.3 + f.base * 2) * 0.13;
      f.light.intensity = 9 * k;
      f.flame.scale.set(0.9 * k, 1.2 * k, 1);
    }
    if (!this.active) return;
    this.ray.setFromCamera(this.pointer, this.d.camera());
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) {
      this.ghost.visible = false;
      return;
    }
    // O que está sob o ponteiro (para apagar).
    let best: string | undefined;
    let bd = 2.2;
    for (const [id, p] of this.placed) {
      const dd = Math.hypot(p.item.x - this.hit.x, p.item.z - this.hit.z);
      if (dd < bd) [best, bd] = [id, dd];
    }
    if (best !== this.hover) {
      if (this.hover) this.highlight(this.hover, false);
      this.hover = best;
      if (best) this.highlight(best, true);
    }
    // Não deixa pôr nada dentro de prédio, água ou fora do mapa.
    this.ghostOk = !this.d.isBlocked(this.hit.x, this.hit.z);
    this.ghost.visible = true;
    this.ghost.position.set(this.hit.x, 0, this.hit.z);
    this.ghost.rotation.y = this.rot;
    this.ghost.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && "color" in m && (o as THREE.Mesh).isMesh) m.color.set(this.ghostOk ? 0x7dff8a : 0xff5a4a);
    });
  }

  // ---------- Itens ----------

  private newId() {
    return `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
  }

  private addItem(item: ScenarioItem) {
    const kit = propKit();
    const obj = new THREE.Group();
    obj.position.set(item.x, 0, item.z);
    obj.rotation.y = item.rot ?? 0;
    const p: Placed = { item, obj, lights: [], enemies: [], tiles: [] };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = true;
      x.receiveShadow = true;
      obj.add(x);
      return x;
    };
    switch (item.kind) {
      case "crate":
        mesh(kit.crate, kit.crateMat).scale.setScalar(0.9);
        break;
      case "barrel":
        mesh(kit.barrel, kit.barrelMat);
        break;
      case "barrier":
        mesh(kit.barrier, kit.barrierMat);
        break;
      case "car": {
        const mat = (kit.carMat as THREE.MeshStandardMaterial).clone();
        mat.color.set(item.color ?? CAR_COLORS[0]!);
        mesh(kit.carBody, mat);
        mesh(kit.carCabin, kit.glassMat);
        break;
      }
      case "tree":
        mesh(kit.trunk, kit.trunkMat);
        mesh(kit.canopy, kit.leafMat);
        break;
      case "lamp": {
        mesh(kit.lampPole, kit.metal);
        mesh(kit.lampHead, kit.headMat);
        const pool = new THREE.Mesh(kit.pool, kit.poolMat);
        pool.position.set(1.65, 0.03, 0);
        obj.add(pool);
        const l = new THREE.PointLight(0xffa860, 14, 16, 1.7);
        l.position.set(1.65, 5.9, 0);
        obj.add(l);
        p.lights.push(l);
        this.lamps.push(l);
        break;
      }
      case "fire": {
        mesh(kit.barrel, kit.barrelMat);
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        flame.position.y = 1.45;
        obj.add(flame);
        const l = new THREE.PointLight(0xff8a3a, 9, 14, 1.6);
        l.position.y = 1.8;
        l.castShadow = false;
        obj.add(l);
        p.lights.push(l);
        this.flicker.push({ light: l, flame, base: Math.random() * 10 });
        break;
      }
      case "pack": {
        const n = item.count ?? 4;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const r = n > 1 ? 1.6 + (k % 2) * 0.8 : 0;
          const kind = k === 0 && n >= 4 ? KINDS.graúda : KINDS.cria;
          const en = new Enemy(kind, item.x + Math.cos(a) * r, item.z + Math.sin(a) * r);
          this.d.combat.addEnemy(en);
          p.enemies.push(en);
          loadModel(kind.model)
            .then((asset) => en.useModel(asset))
            .catch(() => undefined);
        }
        break;
      }
      case "survivor": {
        const info = SURVIVOR_MODELS.find((s) => s.id === item.model) ?? SURVIVOR_MODELS[0]!;
        void this.d.survivors.add(info.id, item.label ?? info.name, new THREE.Vector3(item.x, 0, item.z), item.rot ?? 0).then((root) => {
          if (!root) return;
          if (this.placed.get(item.id) === p) p.npc = root;
          else this.d.survivors.remove(root);
        });
        break;
      }
      case "refuge": {
        // Fogueira com pedras e uma bandeira: o jogador renasce aqui.
        const stones = new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.95 });
        for (let k = 0; k < 8; k++) {
          const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), stones);
          s.position.set(Math.cos((k / 8) * Math.PI * 2) * 0.6, 0.1, Math.sin((k / 8) * Math.PI * 2) * 0.6);
          obj.add(s);
        }
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        flame.position.y = 0.6;
        obj.add(flame);
        const l = new THREE.PointLight(0xff9a4a, 10, 18, 1.5);
        l.position.y = 1.2;
        obj.add(l);
        p.lights.push(l);
        this.flicker.push({ light: l, flame, base: Math.random() * 10 });
        const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6).translate(0, 1.5, 0), kit.metal);
        pole.position.set(1.2, 0, 0);
        const flag = mesh(new THREE.PlaneGeometry(0.9, 0.55).translate(0.45, 2.6, 0), new THREE.MeshStandardMaterial({ color: 0xf0b44a, side: THREE.DoubleSide, emissive: 0x402a08 }));
        flag.position.set(1.2, 0, 0);
        this.d.refuge.set(item.x, 0, item.z);
        break;
      }
    }
    // Marcador do builder: anel no chão com a cor do tipo (só aparece com o builder aberto).
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(item.kind === "pack" ? 3 : 0.9, item.kind === "pack" ? 3.2 : 1.05, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: item.kind === "pack" ? 0xff5a4a : item.kind === "survivor" ? 0x5ad1ff : item.kind === "refuge" ? 0xffcf4a : 0xe9e4d8, transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
    );
    ring.position.set(item.x, 0.06, item.z);
    ring.userData.id = item.id;
    this.markers.add(ring);
    obj.userData.ring = ring;
    // Objetos sólidos bloqueiam o tile onde estão.
    const solid = PALETTE.find((q) => q.kind === item.kind)!.solid;
    if (solid !== undefined) {
      const m = this.d.metersPerTile;
      const key = tileKey(Math.floor(item.x / m), Math.floor(item.z / m));
      this.d.extraHeights.set(key, Math.max(this.d.extraHeights.get(key) ?? 0, solid));
      p.tiles.push(key);
    }
    this.group.add(obj);
    this.placed.set(item.id, p);
    this.refresh();
  }

  private removeItem(id: string, record: boolean) {
    const p = this.placed.get(id);
    if (!p) return;
    if (record) this.pushUndo();
    this.group.remove(p.obj);
    this.markers.remove(p.obj.userData.ring as THREE.Object3D);
    for (const e of p.enemies) this.d.combat.removeEnemy(e);
    if (p.npc) this.d.survivors.remove(p.npc);
    this.lamps = this.lamps.filter((l) => !p.lights.includes(l));
    this.flicker = this.flicker.filter((f) => !p.lights.includes(f.light));
    for (const k of p.tiles) {
      const others = [...this.placed.values()].filter((o) => o !== p && o.tiles.includes(k));
      if (others.length) this.d.extraHeights.set(k, Math.max(...others.map((o) => PALETTE.find((q) => q.kind === o.item.kind)!.solid ?? 0)));
      else this.d.extraHeights.delete(k);
    }
    if (p.item.kind === "refuge") this.d.refuge.copy(this.originalRefuge);
    this.placed.delete(id);
    if (this.hover === id) this.hover = undefined;
    if (record) this.save();
    this.refresh();
  }

  private highlight(id: string, on: boolean) {
    const ring = this.placed.get(id)?.obj.userData.ring as THREE.Mesh | undefined;
    if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.55;
  }

  private clearAll() {
    for (const id of [...this.placed.keys()]) this.removeItem(id, false);
  }

  // ---------- Salvar / carregar ----------

  toScenario(): Scenario {
    return { version: 1, city: this.d.city, name: this.name, updatedAt: this.updatedAt || Date.now(), items: [...this.placed.values()].map((p) => p.item) };
  }

  private apply(s: Scenario) {
    this.clearAll();
    this.name = s.name;
    this.updatedAt = s.updatedAt;
    for (const it of s.items) this.addItem(it);
  }

  private save() {
    this.updatedAt = Date.now();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.toScenario()));
    } catch {
      // Sem armazenamento: fica só nesta sessão.
    }
    this.refresh();
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const r = Scenario.safeParse(JSON.parse(raw));
      if (r.success && r.data.city === this.d.city) this.apply(r.data);
    } catch {
      // Cenário salvo inválido: começa vazio.
    }
  }

  private pushUndo() {
    this.undo.push(JSON.stringify(this.toScenario()));
    if (this.undo.length > MAX_UNDO) this.undo.shift();
  }

  private undoLast() {
    const prev = this.undo.pop();
    if (!prev) return;
    this.apply(Scenario.parse(JSON.parse(prev)));
    this.save();
  }

  private exportJson() {
    const blob = new Blob([JSON.stringify(this.toScenario(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cenario-${this.d.city}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private async importJson(file: File) {
    const status = this.el.querySelector<HTMLElement>(".b-status")!;
    try {
      const r = Scenario.safeParse(JSON.parse(await file.text()));
      if (!r.success) throw new Error(r.error.issues[0]?.message ?? "formato inválido");
      if (r.data.city !== this.d.city) throw new Error(`o arquivo é da cidade "${r.data.city}"`);
      this.pushUndo();
      this.apply(r.data);
      this.save();
      status.textContent = `Importado: ${r.data.items.length} itens.`;
    } catch (e) {
      status.textContent = `Não deu para importar: ${(e as Error).message}`;
    }
  }

  // ---------- Interface ----------

  private select(kind: ScenarioItemKind) {
    this.kind = kind;
    this.ghost.clear();
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.35, depthWrite: false, fog: false });
    const kit = propKit();
    const add = (g: THREE.BufferGeometry) => this.ghost.add(new THREE.Mesh(g, mat));
    const geo: Partial<Record<ScenarioItemKind, THREE.BufferGeometry[]>> = {
      crate: [kit.crate],
      barrel: [kit.barrel],
      barrier: [kit.barrier],
      car: [kit.carBody, kit.carCabin],
      tree: [kit.trunk, kit.canopy],
      lamp: [kit.lampPole, kit.lampHead],
      fire: [kit.barrel],
    };
    for (const g of geo[kind] ?? [new THREE.CylinderGeometry(0.35, 0.35, 1.8, 12).translate(0, 0.9, 0)]) add(g);
    const r = kind === "pack" ? 3 : 1;
    this.ghost.add(new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r, 40).rotateX(-Math.PI / 2).translate(0, 0.05, 0), mat));
    this.refresh();
  }

  private buildUi() {
    this.el.innerHTML = `
      <header><h2>Builder de cenário</h2><button class="b-close" title="Sair (Esc ou B)">✕</button></header>
      <p class="b-hint">Clique no chão para colocar · botão direito ou Delete apaga · <kbd>R</kbd> gira · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz · WASD anda e a roda dá zoom. O jogo fica parado enquanto você monta.</p>
      <div class="b-grid">${PALETTE.map((p, i) => `<button data-kind="${p.kind}" title="${p.hint}"><span>${p.icon}</span>${p.name}<kbd>${(i + 1) % 10}</kbd></button>`).join("")}</div>
      <div class="b-opts" data-for="pack"><label>Crias no bando <input type="range" min="1" max="8" value="${this.packCount}" class="b-count"> <b class="b-count-v">${this.packCount}</b></label></div>
      <div class="b-opts" data-for="survivor"><label>Quem <select class="b-npc">${SURVIVOR_MODELS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select></label></div>
      <h3>Cenário de ${this.d.city}</h3>
      <ul class="b-stats"></ul>
      <div class="b-actions">
        <button class="b-export">Exportar JSON</button>
        <label class="b-import">Importar JSON<input type="file" accept="application/json,.json" hidden></label>
        <button class="b-clear">Limpar tudo</button>
      </div>
      <p class="b-status"></p>
      <p class="b-note">Salvo automaticamente neste navegador. O JSON exportado segue o schema <code>Scenario</code> do pacote shared; o admin vai publicar a versão aprovada para todos os jogadores.</p>`;
    this.el.querySelector(".b-close")!.addEventListener("click", () => this.close());
    this.el.querySelectorAll<HTMLButtonElement>(".b-grid button").forEach((b) => b.addEventListener("click", () => this.select(b.dataset.kind as ScenarioItemKind)));
    const count = this.el.querySelector<HTMLInputElement>(".b-count")!;
    count.addEventListener("input", () => {
      this.packCount = Number(count.value);
      this.el.querySelector(".b-count-v")!.textContent = count.value;
    });
    const npc = this.el.querySelector<HTMLSelectElement>(".b-npc")!;
    npc.addEventListener("change", () => (this.survivorModel = npc.value));
    this.el.querySelector(".b-export")!.addEventListener("click", () => this.exportJson());
    const file = this.el.querySelector<HTMLInputElement>(".b-import input")!;
    file.addEventListener("change", () => {
      if (file.files?.[0]) void this.importJson(file.files[0]);
      file.value = "";
    });
    const clear = this.el.querySelector<HTMLButtonElement>(".b-clear")!;
    clear.addEventListener("click", () => {
      if (clear.dataset.confirm !== "1") {
        clear.dataset.confirm = "1";
        clear.textContent = "Clique de novo para apagar";
        setTimeout(() => {
          clear.dataset.confirm = "";
          clear.textContent = "Limpar tudo";
        }, 2500);
        return;
      }
      clear.dataset.confirm = "";
      clear.textContent = "Limpar tudo";
      this.pushUndo();
      this.clearAll();
      this.save();
    });
    this.select(this.kind);
  }

  private refresh() {
    this.el.querySelectorAll<HTMLButtonElement>(".b-grid button").forEach((b) => b.classList.toggle("on", b.dataset.kind === this.kind));
    this.el.querySelectorAll<HTMLElement>(".b-opts").forEach((o) => (o.style.display = o.dataset.for === this.kind ? "block" : "none"));
    const counts = new Map<ScenarioItemKind, number>();
    for (const p of this.placed.values()) counts.set(p.item.kind, (counts.get(p.item.kind) ?? 0) + 1);
    const stats = this.el.querySelector(".b-stats");
    if (stats)
      stats.innerHTML = counts.size
        ? PALETTE.filter((p) => counts.has(p.kind))
            .map((p) => `<li><span>${p.icon} ${p.name}</span><b>${counts.get(p.kind)}</b></li>`)
            .join("")
        : `<li class="empty">Nada colocado ainda.</li>`;
  }
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

let fire: THREE.Texture | undefined;
function fireTex() {
  return (fire ??= radialTexture("rgba(255,220,140,1)", "rgba(255,90,20,0)"));
}
