import * as THREE from "three";

/** Faíscas, poeira e fumaça: um pool fixo de partículas aditivas atualizado na CPU. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private base: Float32Array;
  private next = 0;

  constructor(scene: THREE.Scene, private n = 600) {
    this.pos = new Float32Array(n * 3).fill(-1e4);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.base = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const [c, ctx] = [document.createElement("canvas"), null as CanvasRenderingContext2D | null];
    c.width = c.height = 32;
    const g2 = ctx ?? c.getContext("2d")!;
    const grad = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ size: 0.35, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Solta `count` partículas em `at`, com velocidade aleatória em volta de `dir`. */
  burst(at: THREE.Vector3, count: number, color: THREE.Color, speed = 5, life = 0.6, dir = new THREE.Vector3(0, 1, 0), spread = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * spread).add(dir).normalize();
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = v.x * s;
      this.vel[i * 3 + 1] = v.y * s;
      this.vel[i * 3 + 2] = v.z * s;
      this.base[i * 3] = color.r;
      this.base[i * 3 + 1] = color.g;
      this.base[i * 3 + 2] = color.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      const k = Math.max(0, this.life[i]! / this.maxLife[i]!);
      this.vel[i * 3 + 1]! -= 9 * dt * 0.6;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a]! *= 1 - dt * 2.5;
        this.pos[i * 3 + a]! += this.vel[i * 3 + a]! * dt;
        this.col[i * 3 + a] = this.base[i * 3 + a]! * k;
      }
      if (this.pos[i * 3 + 1]! < 0.05) {
        this.pos[i * 3 + 1] = 0.05;
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]!) * 0.3;
      }
      if (this.life[i]! <= 0) this.pos[i * 3 + 1] = -1e4;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.color!.needsUpdate = true;
  }
}

/** Números de dano e textos flutuantes em HTML, presos a um ponto do mundo. */
export class FloatingText {
  private items: { el: HTMLDivElement; pos: THREE.Vector3; t: number; life: number }[] = [];
  private tmp = new THREE.Vector3();

  constructor(private root: HTMLElement) {}

  show(text: string, at: THREE.Vector3, cls = "dmg", life = 0.9) {
    const el = document.createElement("div");
    el.className = `float ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.items.push({ el, pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0)), t: 0, life });
  }

  update(dt: number, camera: THREE.Camera) {
    this.items = this.items.filter((it) => {
      it.t += dt;
      if (it.t >= it.life) {
        it.el.remove();
        return false;
      }
      this.tmp.copy(it.pos).setY(it.pos.y + it.t * 1.6).project(camera);
      it.el.style.left = `${(this.tmp.x * 0.5 + 0.5) * innerWidth}px`;
      it.el.style.top = `${(-this.tmp.y * 0.5 + 0.5) * innerHeight}px`;
      it.el.style.opacity = String(1 - Math.max(0, (it.t - it.life * 0.6) / (it.life * 0.4)));
      return true;
    });
  }
}
