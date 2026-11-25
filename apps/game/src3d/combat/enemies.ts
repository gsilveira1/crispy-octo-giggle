import * as THREE from "three";

export type EnemyKind = { name: string; hp: number; dmg: [number, number]; speed: number; scale: number; attackEvery: number };

export const KINDS: Record<"cria" | "graúda", EnemyKind> = {
  cria: { name: "Cria da Cerração", hp: 60, dmg: [4, 7], speed: 3.2, scale: 1, attackEvery: 1.4 },
  graúda: { name: "Cria Graúda", hp: 140, dmg: [8, 13], speed: 2.6, scale: 1.45, attackEvery: 2 },
};

const AGGRO_M = 9;
const LEASH_M = 26;
const REACH_M = 1.5;
const RESPAWN_S = 25;

const shadowMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.6, emissive: 0x1a2440, emissiveIntensity: 0.4, flatShading: true });
const wispMat = new THREE.MeshBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0.1, depthWrite: false });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a });

/**
 * Uma cria da Cerração: sombra curvada, olhos acesos e fiapos de névoa em volta.
 * IA: fica perto de casa, persegue quem chega perto, ataca no alcance e volta se for longe demais.
 */
export class Enemy {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly pos = new THREE.Vector3();
  hp: number;
  dead = false;
  stunned = 0;
  hitFlash = 0;
  private home: THREE.Vector3;
  private state: "idle" | "chase" | "return" = "idle";
  private wander = new THREE.Vector3();
  private wanderT = 0;
  private attackCd = 0;
  private lunge = 0;
  /** Aviso do ataque: a cria se prepara (olhos acendem, braços sobem) antes de bater. */
  windup = 0;
  private knockV = new THREE.Vector3();
  private flinch = 0;
  private eyes: THREE.MeshBasicMaterial;
  private deadT = 0;
  private t = Math.random() * 10;
  private wisps: THREE.Mesh[] = [];
  private mats: THREE.MeshStandardMaterial;
  pulled?: THREE.Vector3;

  constructor(readonly kind: EnemyKind, x: number, z: number) {
    this.home = new THREE.Vector3(x, 0, z);
    this.pos.copy(this.home);
    this.hp = kind.hp;
    this.mats = shadowMat.clone();
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0).scale(0.9, 1.3, 0.8), this.mats);
    torso.position.set(0, 0.95, -0.05);
    torso.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), this.mats);
    head.position.set(0, 1.42, 0.22);
    const eyeG = new THREE.SphereGeometry(0.045, 6, 4);
    this.eyes = eyeMat.clone();
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(eyeG, this.eyes);
      eye.position.set(0.09 * s, 1.46, 0.44);
      this.body.add(eye);
    }
    // Braços compridos e garras.
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.95, 5).rotateX(Math.PI), this.mats);
      arm.position.set(0.38 * s, 0.85, 0.15);
      arm.rotation.z = 0.25 * s;
      arm.rotation.x = -0.3;
      arm.name = "arm";
      this.body.add(arm);
    }
    const legs = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 6).rotateX(Math.PI).translate(0, 0.3, 0), this.mats);
    this.body.add(torso, head, legs);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.2, 6, 5), wispMat);
      this.wisps.push(w);
      this.root.add(w);
    }
    this.body.scale.setScalar(kind.scale);
    this.root.add(this.body);
    this.root.userData.enemy = this;
    this.body.traverse((o) => (o.userData.enemy = this));
    this.sync();
  }

  get alive() {
    return !this.dead;
  }

  get center() {
    return this.pos.clone().setY(1.1 * this.kind.scale);
  }

  /** Aplica dano; devolve true se matou. */
  damage(n: number): boolean {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 0.15;
    this.flinch = 0.18;
    if (this.state === "idle") this.state = "chase";
    if (this.hp === 0) {
      this.dead = true;
      this.deadT = 0;
      return true;
    }
    return false;
  }

  /** Empurrão (m/s) que se dissipa em ~0,25 s. */
  knock(dir: THREE.Vector3, force: number) {
    this.knockV.copy(dir).setY(0).normalize().multiplyScalar(force);
  }

  /** Interrompe o ataque que estava preparando. */
  stagger(s: number) {
    this.windup = 0;
    this.stunned = Math.max(this.stunned, s);
  }

  /**
   * Um passo de IA. `onHit` é chamado quando a garra acerta o jogador.
   * Devolve true enquanto a cria está "em combate" (perseguindo).
   */
  update(dt: number, player: THREE.Vector3, playerAlive: boolean, isBlocked: (x: number, z: number) => boolean, onHit: (dmg: number) => void): boolean {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.mats.emissive.setHex(this.hitFlash > 0 ? 0xffffff : 0x1a2440);
    this.mats.emissiveIntensity = this.hitFlash > 0 ? 1.2 : 0.4;
    if (this.dead) {
      this.deadT += dt;
      // Desmancha: afunda e encolhe; depois renasce em casa.
      const k = Math.min(1, this.deadT / 0.8);
      this.body.scale.setScalar(this.kind.scale * (1 - k * 0.9));
      this.body.position.y = -k * 0.6;
      this.root.visible = this.deadT < 0.8;
      if (this.deadT > RESPAWN_S) this.respawn();
      this.sync();
      return false;
    }
    this.attackCd -= dt;
    this.stunned = Math.max(0, this.stunned - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    if (this.knockV.lengthSq() > 0.01) {
      this.tryMove(this.knockV.clone().normalize(), this.knockV.length() * dt, isBlocked);
      this.knockV.multiplyScalar(Math.exp(-dt * 10));
    }
    this.eyes.color.setHex(this.windup > 0 ? 0xffe060 : 0xff5a2a);
    const toP = new THREE.Vector3().subVectors(player, this.pos).setY(0);
    const dP = toP.length();
    const fromHome = this.pos.distanceTo(this.home);
    let move = new THREE.Vector3();
    let speed = this.kind.speed;

    if (this.pulled) {
      // Puxado pelo laço: desliza rápido até o ponto.
      const d = new THREE.Vector3().subVectors(this.pulled, this.pos).setY(0);
      if (d.length() < 0.3) this.pulled = undefined;
      else this.tryMove(d.normalize(), 16 * dt, isBlocked);
      this.sync();
      return true;
    }
    if (this.state === "idle") {
      if (playerAlive && dP < AGGRO_M) this.state = "chase";
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3;
        this.wander.set(this.home.x + (Math.random() - 0.5) * 6, 0, this.home.z + (Math.random() - 0.5) * 6);
      }
      move.subVectors(this.wander, this.pos).setY(0);
      if (move.length() < 0.3) move.set(0, 0, 0);
      speed *= 0.35;
    } else if (this.state === "chase") {
      if (!playerAlive || fromHome > LEASH_M) this.state = "return";
      else if (this.windup > 0) {
        // Preparando: fica parado e, no fim, dá o bote em quem ainda estiver perto.
        this.windup -= dt;
        if (this.windup <= 0) {
          this.windup = 0;
          this.lunge = 0.3;
          if (dP < REACH_M * this.kind.scale * 1.4) {
            const [a, b] = this.kind.dmg;
            onHit(Math.round(a + Math.random() * (b - a)));
          }
        }
      } else if (dP > REACH_M * this.kind.scale) move.copy(toP);
      else if (this.attackCd <= 0 && this.stunned <= 0) {
        this.attackCd = this.kind.attackEvery;
        this.windup = 0.45 * (this.kind.scale > 1 ? 1.4 : 1);
      }
    } else {
      move.subVectors(this.home, this.pos).setY(0);
      speed *= 1.6;
      this.hp = Math.min(this.kind.hp, this.hp + this.kind.hp * dt * 0.5);
      if (move.length() < 0.5) this.state = "idle";
    }
    if (this.stunned > 0 || this.windup > 0) move = new THREE.Vector3();
    if (move.lengthSq() > 0) {
      this.tryMove(move.normalize(), speed * dt, isBlocked);
      const look = Math.atan2(move.x, move.z);
      let d = look - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * 8);
    } else if (this.state === "chase") {
      this.root.rotation.y = Math.atan2(toP.x, toP.z);
    }
    // Animação: balanço, bote no ataque, tontura quando atordoada.
    this.lunge = Math.max(0, this.lunge - dt);
    this.body.position.y = Math.sin(this.t * 6) * 0.04;
    this.body.position.z = this.lunge > 0 ? Math.sin((this.lunge / 0.3) * Math.PI) * 0.5 : 0;
    this.body.rotation.z = this.stunned > 0 ? Math.sin(this.t * 14) * 0.2 : 0;
    // Recua no aviso, encolhe quando apanha.
    this.body.rotation.x = this.windup > 0 ? -0.35 : this.flinch > 0 ? -0.4 * (this.flinch / 0.18) : 0;
    this.body.children.forEach((c) => {
      if (c.name === "arm") c.rotation.x = this.windup > 0 ? -2.4 : -0.3 - (this.lunge > 0 ? 1.4 : Math.sin(this.t * 5) * 0.2);
    });
    this.sync();
    return this.state === "chase";
  }

  private tryMove(dir: THREE.Vector3, step: number, isBlocked: (x: number, z: number) => boolean) {
    const nx = this.pos.x + dir.x * step;
    const nz = this.pos.z + dir.z * step;
    if (!isBlocked(nx, this.pos.z)) this.pos.x = nx;
    if (!isBlocked(this.pos.x, nz)) this.pos.z = nz;
  }

  private respawn() {
    this.dead = false;
    this.hp = this.kind.hp;
    this.pos.copy(this.home);
    this.state = "idle";
    this.body.scale.setScalar(this.kind.scale);
    this.body.position.set(0, 0, 0);
    this.root.visible = true;
  }

  private sync() {
    this.root.position.copy(this.pos);
    this.wisps.forEach((w, i) => {
      const a = this.t * (0.6 + i * 0.2) + i * 1.7;
      w.position.set(Math.cos(a) * 0.6, 0.4 + ((this.t * 0.4 + i * 0.25) % 1) * 1.4, Math.sin(a) * 0.6);
      w.scale.setScalar(1 - ((this.t * 0.4 + i * 0.25) % 1) * 0.7);
    });
  }
}
