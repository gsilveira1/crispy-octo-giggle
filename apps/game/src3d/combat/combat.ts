import * as THREE from "three";
import type { Player } from "../world/player";
import { Enemy, KINDS } from "./enemies";
import { FloatingText, Particles } from "./fx";

/**
 * Habilidades provisórias do Cavaleiro (corpo a corpo, rápido e móvel — issue #17).
 * As habilidades definitivas das 5 classes saem da issue #20; aqui é só para sentir o combate.
 */
type Skill = { key: string; name: string; icon: string; cd: number; range: number; needsTarget: boolean; desc: string };
const SKILLS: Skill[] = [
  { key: "1", name: "Talho", icon: "⚔", cd: 4, range: 2.4, needsTarget: true, desc: "Golpe forte de facão (25 de dano)" },
  { key: "2", name: "Investida", icon: "➤", cd: 9, range: 12, needsTarget: true, desc: "Avança até o alvo, 14 de dano e atordoa 1,5 s" },
  { key: "3", name: "Redemoinho", icon: "✺", cd: 7, range: 0, needsTarget: false, desc: "Gira o facão: 18 de dano em todos a até 3,5 m" },
  { key: "4", name: "Chimarrão", icon: "☕", cd: 20, range: 0, needsTarget: false, desc: "Recupera 40 de vida" },
];
const AUTO_EVERY = 1.1;
const AUTO_RANGE = 2.8;
const MAX_HP = 120;
const ABALADO_S = 20;

const SPARK = new THREE.Color(1.6, 1.0, 0.45);
const SHADOW = new THREE.Color(0.35, 0.4, 0.6);
const BLOOD = new THREE.Color(1.2, 0.25, 0.15);
const HEAL = new THREE.Color(0.4, 1.4, 0.5);

/**
 * Combate local (sem servidor ainda): bandos de crias, alvo por Tab ou clique, ataque automático
 * no alcance e quatro habilidades com recarga. Morrer manda o jogador de volta ao refúgio, abalado.
 */
export class Combat {
  readonly enemies: Enemy[] = [];
  private group = new THREE.Group();
  target?: Enemy;
  hp = MAX_HP;
  private cds = SKILLS.map(() => 0);
  private autoCd = 0;
  private abalado = 0;
  private dead = 0;
  private inCombat = 0;
  private ring: THREE.Mesh;
  private fx: Particles;
  private text: FloatingText;
  private hud: { hp: HTMLElement; hpText: HTMLElement; target: HTMLElement; targetName: HTMLElement; targetHp: HTMLElement; slots: HTMLElement[]; status: HTMLElement; hurt: HTMLElement };
  private bars = new Map<Enemy, HTMLDivElement>();
  private tmp = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  /** Quando o jogador clica numa cria, ele anda até ela. */
  approach = false;

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
      g.strokeStyle = "#ff4a2a";
      g.lineWidth = 8;
      g.beginPath();
      g.arc(64, 64, 52, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.arc(64, 64, 40, 0, Math.PI * 2);
      g.stroke();
      return new THREE.CanvasTexture(c);
    })();
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.visible = false;
    scene.add(this.ring);
    this.hud = this.buildHud();
    addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        this.cycleTarget();
      }
      if (e.code === "Escape") this.setTarget(undefined);
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

  /** Clique na tela: se acertar uma cria, vira o alvo (e o jogador vai até ela). Devolve true se pegou. */
  click(ndc: THREE.Vector2, camera: THREE.Camera): boolean {
    this.ray.setFromCamera(ndc, camera);
    const hits = this.ray.intersectObjects(this.enemies.filter((e) => e.alive).map((e) => e.body), true);
    const e = hits[0]?.object.userData.enemy as Enemy | undefined;
    if (!e) return false;
    this.setTarget(e);
    this.approach = true;
    return true;
  }

  /** Direção para andar até o alvo, quando o jogador clicou nele. */
  approachDir(out: THREE.Vector2): boolean {
    if (!this.approach || !this.target?.alive) return false;
    const d = this.tmp.subVectors(this.target.pos, this.player.position).setY(0);
    if (d.length() <= AUTO_RANGE * 0.85) return false;
    out.set(d.x, d.z).normalize();
    return true;
  }

  update(dt: number, camera: THREE.Camera) {
    const p = this.player.position;
    this.autoCd -= dt;
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
      if (e.update(dt, p, this.alive, this.isBlocked, (dmg) => this.hurt(dmg, e))) chasing = true;
    }
    if (chasing) this.inCombat = 4;
    // Fora de combate, a vida volta devagar.
    if (this.alive && this.inCombat <= 0) this.hp = Math.min(MAX_HP, this.hp + dt * 6);

    if (this.target && !this.target.alive) this.setTarget(undefined);
    if (this.target && this.target.pos.distanceTo(p) > 40) this.setTarget(undefined);
    // Ataque automático no alcance.
    if (this.alive && this.target) {
      this.player.face(this.target.pos);
      const d = this.target.pos.distanceTo(p);
      if (d <= AUTO_RANGE * this.target.kind.scale && this.autoCd <= 0) {
        this.autoCd = AUTO_EVERY;
        this.player.swing();
        this.hit(this.target, 8 + Math.floor(Math.random() * 5));
      }
      if (d <= AUTO_RANGE) this.approach = false;
    } else this.player.face(undefined);

    if (this.target) {
      this.ring.visible = true;
      this.ring.position.set(this.target.pos.x, 0.05, this.target.pos.z);
      this.ring.scale.setScalar(this.target.kind.scale * (1 + Math.sin(performance.now() / 200) * 0.05));
      this.ring.rotation.y += dt;
    } else this.ring.visible = false;

    this.fx.update(dt);
    this.text.update(dt, camera);
    this.updateHud(camera);
  }

  private hit(e: Enemy, base: number, color = SPARK) {
    const dmg = Math.round(base * (this.abalado > 0 ? 0.7 : 1));
    const killed = e.damage(dmg);
    this.inCombat = 4;
    const at = e.center;
    this.fx.burst(at, 14, color, 6, 0.4, this.tmp.subVectors(at, this.player.position).setY(0.6).normalize(), 0.8);
    this.fx.burst(at, 6, SHADOW, 2, 0.9);
    this.text.show(String(dmg), at.setY(at.y + 0.6), "dmg");
    if (killed) {
      this.fx.burst(e.center, 40, SHADOW, 4, 1.4);
      this.fx.burst(e.center, 16, new THREE.Color(1.4, 0.5, 0.2), 5, 0.7);
      this.text.show("dissipou", e.center.setY(2.2), "info", 1.2);
    }
  }

  private hurt(dmg: number, from: Enemy) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.inCombat = 4;
    if (!this.target) this.setTarget(from);
    this.fx.burst(this.player.position.clone().setY(1.2), 8, BLOOD, 3, 0.4);
    this.text.show(`-${dmg}`, this.player.position.clone().setY(2.2), "hurt");
    this.hud.hurt.style.opacity = "1";
    setTimeout(() => (this.hud.hurt.style.opacity = "0"), 120);
    if (this.hp === 0) {
      this.dead = 3;
      this.setTarget(undefined);
      this.hud.status.textContent = "Você caiu… voltando ao refúgio";
      this.hud.status.style.opacity = "1";
    }
  }

  private respawn() {
    this.player.position.copy(this.refuge);
    this.hp = MAX_HP * 0.6;
    this.abalado = ABALADO_S;
    this.hud.status.textContent = "Abalado: dano reduzido por 20 s";
    setTimeout(() => (this.hud.status.style.opacity = "0"), 3000);
  }

  private cast(i: number) {
    const s = SKILLS[i]!;
    if (!this.alive || this.cds[i]! > 0) return;
    const p = this.player.position;
    const t = this.target;
    if (s.needsTarget) {
      if (!t?.alive) return this.warn("Sem alvo (Tab)");
      if (t.pos.distanceTo(p) > s.range * Math.max(1, t.kind.scale * 0.9)) return this.warn("Longe demais");
    }
    this.cds[i] = s.cd;
    this.inCombat = 4;
    this.flashSlot(i);
    if (s.name === "Talho") {
      this.player.swing();
      this.hit(t!, 25);
      this.fx.burst(t!.center, 20, new THREE.Color(1.8, 1.4, 0.8), 8, 0.35);
    } else if (s.name === "Investida") {
      // Avança em linha reta até ficar colado no alvo, levantando poeira.
      const dir = this.tmp.subVectors(t!.pos, p).setY(0);
      const dist = Math.max(0, dir.length() - 1.2);
      dir.normalize();
      const steps = Math.ceil(dist / 0.4);
      for (let k = 0; k < steps; k++) {
        const nx = p.x + dir.x * 0.4;
        const nz = p.z + dir.z * 0.4;
        if (this.isBlocked(nx, nz)) break;
        if (k % 2 === 0) this.fx.burst(new THREE.Vector3(p.x, 0.2, p.z), 3, new THREE.Color(0.5, 0.45, 0.4), 1.5, 0.6);
        p.x = nx;
        p.z = nz;
      }
      this.player.swing();
      t!.stunned = 1.5;
      this.hit(t!, 14);
      this.text.show("atordoada", t!.center.setY(2.4), "info");
    } else if (s.name === "Redemoinho") {
      this.player.swing("spin");
      this.fx.burst(p.clone().setY(1), 40, new THREE.Color(1.2, 1.1, 1), 7, 0.35, new THREE.Vector3(0, 0.2, 0), 3);
      for (const e of this.enemies) if (e.alive && e.pos.distanceTo(p) <= 3.5 * Math.max(1, e.kind.scale * 0.8)) this.hit(e, 18);
    } else if (s.name === "Chimarrão") {
      this.hp = Math.min(MAX_HP, this.hp + 40);
      this.fx.burst(p.clone().setY(1.2), 24, HEAL, 2.5, 1, new THREE.Vector3(0, 1, 0), 0.5);
      this.text.show("+40", p.clone().setY(2.3), "heal");
    }
  }

  private warn(msg: string) {
    this.text.show(msg, this.player.position.clone().setY(2.5), "info", 0.8);
  }

  private cycleTarget() {
    const p = this.player.position;
    const list = this.enemies.filter((e) => e.alive && e.pos.distanceTo(p) < 25).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
    if (!list.length) return this.setTarget(undefined);
    const i = this.target ? list.indexOf(this.target) : -1;
    this.setTarget(list[(i + 1) % list.length]);
    this.approach = false;
  }

  private setTarget(e?: Enemy) {
    this.target = e;
    if (!e) this.approach = false;
  }

  private buildHud() {
    const root = document.createElement("div");
    root.id = "combat-hud";
    root.innerHTML = `
      <div id="hurt"></div>
      <div id="me"><b>Forasteiro · Cavaleiro</b><div class="bar"><i id="hp"></i><span id="hptext"></span></div></div>
      <div id="tgt"><b id="tname"></b><div class="bar enemy"><i id="thp"></i></div></div>
      <div id="status"></div>
      <div id="bar">${SKILLS.map((s) => `<div class="slot" title="${s.desc}"><span class="ico">${s.icon}</span><span class="key">${s.key}</span><span class="nm">${s.name}</span><i class="cd"></i></div>`).join("")}</div>`;
    document.body.appendChild(root);
    const $ = (id: string) => root.querySelector<HTMLElement>(id)!;
    return { hp: $("#hp"), hpText: $("#hptext"), target: $("#tgt"), targetName: $("#tname"), targetHp: $("#thp"), slots: [...root.querySelectorAll<HTMLElement>(".slot")], status: $("#status"), hurt: $("#hurt") };
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
    h.target.style.display = this.target ? "block" : "none";
    if (this.target) {
      h.targetName.textContent = this.target.kind.name;
      h.targetHp.style.width = `${(this.target.hp / this.target.kind.hp) * 100}%`;
    }
    SKILLS.forEach((s, i) => {
      const cd = this.cds[i]!;
      const el = h.slots[i]!;
      (el.querySelector(".cd") as HTMLElement).style.setProperty("--p", `${(cd / s.cd) * 360}deg`);
      el.classList.toggle("cooling", cd > 0);
      const t = this.target;
      el.classList.toggle("far", s.needsTarget && (!t || t.pos.distanceTo(this.player.position) > s.range * Math.max(1, t.kind.scale * 0.9)));
    });
    // Barrinha de vida em cima das crias feridas ou do alvo.
    for (const e of this.enemies) {
      const show = e.alive && e.root.visible && (e === this.target || e.hp < e.kind.hp);
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
      bar.classList.toggle("sel", e === this.target);
    }
  }
}
