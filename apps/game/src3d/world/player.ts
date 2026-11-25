import * as THREE from "three";

/** Metros por segundo andando (GameRules.playerSpeedMetersPerSecond). */
const WALK_MPS = 4;
const RUN_FACTOR = 2.1;
/** Aceleração e frenagem (m/s²): o personagem tem peso, mas responde rápido. */
const ACCEL = 38;
const DECEL = 30;
const DODGE_S = 0.42;
const DODGE_MPS = 10;
const DODGE_CD = 0.9;

export type Action = "slash1" | "slash2" | "slash3" | "spin" | "charge" | "drink" | "hurt" | "dodge";
const DURATION: Record<Action, number> = { slash1: 0.34, slash2: 0.34, slash3: 0.46, spin: 0.42, charge: 0.4, drink: 1.1, hurt: 0.28, dodge: DODGE_S };

const mat = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const capsule = (r: number, len: number, m: THREE.Material) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, -len / 2 - r * 0.6, 0), m);
const ease = (k: number) => k * k * (3 - 2 * k);
const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

type Pose = Record<string, [number, number, number]>;

/**
 * Forasteiro de poncho, bombacha e chapéu, com facão e lampião. O corpo é um esqueleto de grupos
 * (quadril, coluna, peito, ombros, cotovelos, coxas, joelhos) animado por código: andar e correr
 * pelo passo, ações por cima (golpes, giro, investida, chimarrão, dano, esquiva) e queda.
 * Cada quadro monta uma pose-alvo e as juntas se aproximam dela suavemente.
 */
export class Player {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector2();
  private body = new THREE.Group();
  private j: Record<string, THREE.Object3D> = {};
  private poncho: THREE.Mesh;
  private cuia: THREE.Object3D;
  private lantern: THREE.PointLight;
  private bladeTip = new THREE.Object3D();
  private bladeBase = new THREE.Object3D();
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private heading = 0;
  private phase = 0;
  private action?: Action;
  private actionT = 0;
  private dodgeDir = new THREE.Vector2();
  private dodgeCd = 0;
  private dead = false;
  private deadT = 0;
  private faceTarget?: THREE.Vector3;
  private t = 0;
  moving = false;

  constructor(x: number, z: number, private isBlocked: (x: number, z: number) => boolean) {
    this.position.set(x, 0, z);
    const skin = mat(0xc08e66, 0.7);
    const shirt = mat(0xe3dccb);
    const bomb = mat(0x2d2a26, 0.95);
    const boot = mat(0x1a120c, 0.5);
    const hatM = mat(0x2b1f16);
    const J = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.name = name;
      parent.add(g);
      this.j[name] = g;
      return g;
    };
    const hips = J("hips", this.body, 0, 0.98, 0);
    hips.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8).scale(1.1, 0.7, 0.85), bomb));
    // Pernas: coxa larga (bombacha), canela e bota.
    for (const s of [1, -1]) {
      const side = s > 0 ? "L" : "R";
      const thigh = J(`thigh${side}`, hips, 0.1 * s, -0.04, 0);
      thigh.add(capsule(0.095, 0.24, bomb));
      const knee = J(`knee${side}`, thigh, 0, -0.44, 0);
      knee.add(capsule(0.065, 0.24, bomb));
      const foot = J(`foot${side}`, knee, 0, -0.42, 0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.27).translate(0, -0.05, 0.05), boot);
      const cano = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.2, 8).translate(0, 0.08, 0), boot);
      foot.add(b, cano);
    }
    const spine = J("spine", hips, 0, 0.08, 0);
    const chest = J("chest", spine, 0, 0.22, 0);
    chest.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 4, 10).translate(0, 0.1, 0).scale(1.15, 1, 0.8), shirt));
    // Poncho: tecido de barro com listras, aberto na frente, balança com o movimento.
    const pTex = (() => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "#8a3424";
      g.fillRect(0, 0, 64, 64);
      for (const [y, col] of [[46, "#d9b25a"], [50, "#1d1a17"], [54, "#d9b25a"]] as const) {
        g.fillStyle = col;
        g.fillRect(0, y, 64, 2);
      }
      g.fillStyle = "#6e2618";
      for (let x = 0; x < 64; x += 3) g.fillRect(x, 60, 1, 4);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.x = 3;
      return t;
    })();
    this.poncho = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, 0.62, 10, 3, true, 0.35, Math.PI * 2 - 0.7).translate(0, -0.2, 0), new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.95, side: THREE.DoubleSide }));
    this.poncho.position.y = 0.36;
    chest.add(this.poncho);
    const neck = J("neck", chest, 0, 0.42, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12).scale(1, 1.1, 1), skin);
    head.position.y = 0.12;
    const lenco = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12).rotateX(Math.PI / 2), mat(0xb3261e));
    lenco.position.y = 0.0;
    const bigode = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), mat(0x2a1a10));
    bigode.position.set(0, 0.08, 0.125);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 5).rotateX(Math.PI / 2), skin);
    nose.position.set(0, 0.12, 0.14);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.025, 20), hatM);
    brim.position.y = 0.24;
    brim.rotation.x = -0.08;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 14), hatM);
    crown.position.y = 0.32;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 14), mat(0x111111));
    band.position.y = 0.27;
    J("head", neck, 0, 0, 0).add(head, lenco, bigode, nose, brim, crown, band);
    // Braços.
    for (const s of [1, -1]) {
      const side = s > 0 ? "L" : "R";
      const sh = J(`shoulder${side}`, chest, 0.24 * s, 0.32, 0);
      sh.add(capsule(0.055, 0.2, shirt));
      const el = J(`elbow${side}`, sh, 0, -0.3, 0);
      el.add(capsule(0.048, 0.18, shirt));
      const hand = J(`hand${side}`, el, 0, -0.28, 0);
      hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin));
    }
    // Facão na mão direita (lâmina para a frente).
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.7).translate(0, 0, 0.42), new THREE.MeshStandardMaterial({ color: 0xd8dbe0, metalness: 0.95, roughness: 0.2 }));
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.16), mat(0x2a1a10));
    this.bladeBase.position.set(0, 0, 0.15);
    this.bladeTip.position.set(0, 0, 0.78);
    this.j.handR!.add(blade, hilt, this.bladeBase, this.bladeTip);
    // Lampião pendurado na mão esquerda; cuia de chimarrão escondida até beber.
    const lamp = new THREE.Group();
    lamp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a1d10, emissive: 0xffa040, emissiveIntensity: 4 })));
    lamp.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 8), mat(0x222222)).translateY(0.12));
    lamp.position.set(0, -0.14, 0);
    this.j.handL!.add(lamp);
    this.cuia = new THREE.Group();
    this.cuia.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.2, 1), mat(0x5b3a1e)));
    this.cuia.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4).translate(0.02, 0.1, 0), new THREE.MeshStandardMaterial({ color: 0xcfc6a0, metalness: 0.9, roughness: 0.3 })));
    this.cuia.visible = false;
    this.j.handR!.add(this.cuia);
    this.cuia.position.set(0, 0.02, 0.06);

    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.lantern = new THREE.PointLight(0xffa552, 6, 9, 1.6);
    this.root.add(this.body, this.lantern);

    // Rastro do facão: faixa que segue a lâmina durante os golpes.
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    tg.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(16 * 2), 1));
    const idx: number[] = [];
    for (let i = 0; i < 15; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(
      tg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.85, 0.6, vA * 0.35); }",
      }),
    );
    this.trail.frustumCulled = false;
    this.sync();
  }

  /** Adiciona o rastro na cena (fica em coordenadas do mundo). */
  attachTrail(scene: THREE.Scene) {
    scene.add(this.trail);
  }

  get invulnerable() {
    return this.action === "dodge" && this.actionT > 0.04 && this.actionT < DODGE_S - 0.06;
  }

  get busy() {
    return this.dead || this.action === "dodge" || this.action === "drink";
  }

  get facing() {
    return this.heading;
  }

  /** Começa uma ação (golpe, giro, investida, beber, dano). Golpes cancelam a anterior. */
  play(a: Action) {
    if (this.dead || this.action === "dodge") return;
    if (a === "hurt" && this.action && this.action !== "hurt") return;
    this.action = a;
    this.actionT = 0;
    this.cuia.visible = a === "drink";
  }

  /** Compatibilidade: golpe simples ou giro. */
  swing(kind: "slash" | "spin" = "slash") {
    this.play(kind === "spin" ? "spin" : "slash1");
  }

  /** Esquiva rolando na direção pedida (ou para a frente). Devolve true se rolou. */
  dodge(dir: THREE.Vector2): boolean {
    if (this.dead || this.dodgeCd > 0 || this.action === "dodge") return false;
    if (dir.lengthSq() < 0.01) dir = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
    this.dodgeDir.copy(dir).normalize();
    this.heading = Math.atan2(this.dodgeDir.x, this.dodgeDir.y);
    this.action = "dodge";
    this.actionT = 0;
    this.dodgeCd = DODGE_CD;
    this.cuia.visible = false;
    return true;
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.action = undefined;
    this.velocity.set(0, 0);
  }

  revive() {
    this.dead = false;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
  }

  face(p?: THREE.Vector3) {
    this.faceTarget = p;
  }

  /** dir: direção desejada no plano XZ (relativa à câmera), comprimento 0 a 1. */
  update(dt: number, dir: THREE.Vector2, run: boolean, time: number) {
    this.t = time;
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.action) {
      this.actionT += dt;
      if (this.actionT >= DURATION[this.action]) {
        if (this.action === "drink") this.cuia.visible = false;
        this.action = undefined;
      }
    }

    // Velocidade com aceleração; golpes freiam o passo, a esquiva impõe a própria velocidade.
    const want = new THREE.Vector2();
    if (!this.dead && this.action !== "dodge") {
      const len = Math.min(1, dir.length());
      if (len > 0.01) {
        const attacking = this.action && this.action !== "hurt";
        const speed = WALK_MPS * (run && !attacking ? RUN_FACTOR : 1) * (attacking ? 0.45 : 1) * (this.action === "drink" ? 0.5 : 1);
        want.copy(dir).normalize().multiplyScalar(speed * len);
      }
      const rate = want.lengthSq() > this.velocity.lengthSq() ? ACCEL : DECEL;
      const diff = want.clone().sub(this.velocity);
      const maxStep = rate * dt;
      if (diff.length() > maxStep) diff.setLength(maxStep);
      this.velocity.add(diff);
    } else if (this.action === "dodge") {
      const k = this.actionT / DODGE_S;
      this.velocity.copy(this.dodgeDir).multiplyScalar(DODGE_MPS * (1 - k * 0.6));
    } else this.velocity.set(0, 0);

    const v = this.velocity;
    const speed = v.length();
    this.moving = speed > 0.3;
    if (speed > 0.001) {
      const nx = this.position.x + v.x * dt;
      const nz = this.position.z + v.y * dt;
      const pad = 0.3;
      if (!this.isBlocked(nx + Math.sign(v.x) * pad, this.position.z)) this.position.x = nx;
      else v.x = 0;
      if (!this.isBlocked(this.position.x, nz + Math.sign(v.y) * pad)) this.position.z = nz;
      else v.y = 0;
    }

    // Para onde olhar: alvo em combate, senão a direção do movimento.
    if (!this.dead && this.action !== "dodge") {
      const look = this.faceTarget
        ? Math.atan2(this.faceTarget.x - this.position.x, this.faceTarget.z - this.position.z)
        : speed > 0.5
          ? Math.atan2(v.x, v.y)
          : undefined;
      if (look !== undefined) {
        let d = look - this.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += d * damp(dt, 16);
      }
    }
    this.phase += dt * speed * (speed > WALK_MPS * 1.3 ? 1.55 : 2.1);
    this.animate(dt, speed, v);
    this.lantern.intensity = 6 + Math.sin(time * 13) * 0.3 + Math.sin(time * 7.3) * 0.4;
    this.lantern.position.set(Math.sin(this.heading + 1.4) * 0.35, 0.95, Math.cos(this.heading + 1.4) * 0.35);
    this.sync();
    this.updateTrail();
  }

  private animate(dt: number, speed: number, v: THREE.Vector2) {
    const P: Pose = {};
    const set = (name: string, x = 0, y = 0, z = 0) => (P[name] = [x, y, z]);
    const run = THREE.MathUtils.clamp((speed - WALK_MPS) / (WALK_MPS * (RUN_FACTOR - 1)), 0, 1);
    const move = THREE.MathUtils.clamp(speed / WALK_MPS, 0, 1);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const amp = 0.55 + run * 0.35;

    // Locomoção (andar → correr) misturada com respiração parada.
    set("thighL", -s * amp * move);
    set("thighR", s * amp * move);
    set("kneeL", Math.max(0, c) * (0.9 + run * 0.6) * move + 0.05);
    set("kneeR", Math.max(0, -c) * (0.9 + run * 0.6) * move + 0.05);
    set("footL", -0.2 * s * move);
    set("footR", 0.2 * s * move);
    set("shoulderL", s * 0.5 * move * (1 + run * 0.4), 0, 0.12);
    set("shoulderR", -s * 0.5 * move * (1 + run * 0.4) - 0.1, 0, -0.12);
    set("elbowL", -0.25 - run * 1.0 * move);
    set("elbowR", -0.35 - run * 1.0 * move);
    set("spine", 0.06 + 0.22 * run * move, s * 0.08 * move, 0);
    set("chest", Math.sin(this.t * 2) * 0.02, -s * 0.1 * move, 0);
    set("neck", -0.05 - 0.15 * run * move, 0, 0);
    set("hips", 0, s * 0.12 * move, 0);
    let bob = Math.abs(c) * (0.04 + run * 0.06) * move - run * 0.04;
    let bodyRot: [number, number, number] = [0, 0, 0];
    let lift = 0;

    // Ação por cima da locomoção.
    const a = this.action;
    const k = a ? Math.min(1, this.actionT / DURATION[a]) : 0;
    if (a === "slash1" || a === "slash2") {
      const dirS = a === "slash1" ? 1 : -1;
      const wind = k < 0.3 ? ease(k / 0.3) : 1;
      const hit = k < 0.3 ? 0 : ease(Math.min(1, (k - 0.3) / 0.35));
      set("shoulderR", -1.45, dirS * (1.3 * wind - 2.5 * hit), -0.3);
      set("elbowR", -0.5 * (1 - hit));
      set("chest", 0.05, dirS * (0.6 * wind - 1.2 * hit), 0);
      set("spine", 0.12, dirS * (0.2 * wind - 0.4 * hit), 0);
      set("shoulderL", -0.3, 0, 0.5);
      set("elbowL", -1.0);
      set("thighR", -0.5, 0, 0);
      set("kneeR", 0.5);
      set("thighL", 0.35);
      set("kneeL", 0.25);
      bob = -0.06;
    } else if (a === "slash3") {
      const wind = k < 0.38 ? ease(k / 0.38) : 1;
      const hit = k < 0.38 ? 0 : ease(Math.min(1, (k - 0.38) / 0.3));
      set("shoulderR", -3.0 * wind + 2.6 * hit, 0, -0.15);
      set("elbowR", -1.3 * wind * (1 - hit));
      set("shoulderL", -3.0 * wind + 2.4 * hit, 0, 0.15);
      set("elbowL", -1.0 * wind * (1 - hit));
      set("spine", -0.25 * wind + 0.65 * hit, 0, 0);
      set("chest", -0.15 * wind + 0.3 * hit, 0, 0);
      set("thighR", -0.6 * hit);
      set("kneeR", 0.7 * hit);
      set("thighL", 0.4 * hit);
      set("kneeL", 0.3 + 0.3 * hit);
      lift = Math.sin(Math.min(1, k / 0.6) * Math.PI) * 0.18;
      bob = -0.12 * hit;
    } else if (a === "spin") {
      bodyRot = [0, ease(k) * Math.PI * 2, 0];
      set("shoulderR", -1.5, 0, -1.2);
      set("elbowR", 0);
      set("shoulderL", -0.6, 0, 1.0);
      set("spine", 0.25);
      set("thighL", -0.3, 0, 0.3);
      set("thighR", -0.3, 0, -0.3);
      set("kneeL", 0.6);
      set("kneeR", 0.6);
      bob = -0.12;
    } else if (a === "charge") {
      set("spine", 0.55);
      set("shoulderR", -1.6, -0.3, 0);
      set("elbowR", 0);
      set("shoulderL", 0.8, 0, 0.3);
      set("thighR", -1.0);
      set("kneeR", 0.6);
      set("thighL", 0.6);
      set("kneeL", 0.3);
      bob = -0.1;
    } else if (a === "drink") {
      const up = k < 0.2 ? ease(k / 0.2) : k > 0.85 ? 1 - ease((k - 0.85) / 0.15) : 1;
      set("shoulderR", -1.3 * up, -0.4 * up, 0);
      set("elbowR", -2.0 * up);
      set("neck", -0.35 * up, 0, 0);
      set("chest", -0.08 * up, 0, 0);
    } else if (a === "hurt") {
      const h = Math.sin(k * Math.PI);
      set("spine", -0.35 * h);
      set("neck", -0.3 * h);
      set("shoulderR", -0.3 - 0.6 * h, 0, -0.4 * h);
      set("shoulderL", -0.6 * h, 0, 0.5 * h);
    } else if (a === "dodge") {
      // Cambalhota: corpo gira para a frente em volta do centro, encolhido.
      const r = ease(Math.min(1, k / 0.9));
      bodyRot = [r * Math.PI * 2, 0, 0];
      set("spine", 0.9);
      set("neck", 0.5);
      set("thighL", -1.6);
      set("thighR", -1.6);
      set("kneeL", 2.0);
      set("kneeR", 2.0);
      set("shoulderL", -1.2, 0, 0.3);
      set("shoulderR", -1.2, 0, -0.3);
      set("elbowL", -1.4);
      set("elbowR", -1.4);
      bob = -0.45 * Math.sin(k * Math.PI);
    }

    if (this.dead) {
      // Cai de costas e fica no chão.
      this.deadT += dt;
      const d = ease(Math.min(1, this.deadT / 0.6));
      bodyRot = [-1.45 * d, 0, 0.1 * d];
      bob = -0.75 * d + 0.08;
      set("shoulderL", -0.2, 0, 1.2 * d);
      set("shoulderR", -0.2, 0, -1.2 * d);
      set("thighL", -0.3 * d, 0, 0.2);
      set("thighR", 0.1, 0, -0.15);
      set("kneeL", 0.6 * d);
      set("neck", 0.3 * d);
    }

    // Aproxima as juntas da pose; ações rápidas usam uma taxa maior.
    const rate = a && a !== "drink" ? 30 : 14;
    const f = damp(dt, rate);
    for (const [name, obj] of Object.entries(this.j)) {
      const p = P[name] ?? [0, 0, 0];
      obj.rotation.x += (p[0] - obj.rotation.x) * f;
      obj.rotation.y += (p[1] - obj.rotation.y) * f;
      obj.rotation.z += (p[2] - obj.rotation.z) * f;
    }
    const fb = a === "dodge" || a === "spin" ? 1 : damp(dt, 18);
    this.body.rotation.x += (bodyRot[0] - this.body.rotation.x) * fb;
    this.body.rotation.y += (bodyRot[1] - this.body.rotation.y) * fb;
    this.body.rotation.z += (bodyRot[2] - this.body.rotation.z) * fb;
    // Na cambalhota o corpo gira em volta da cintura, não dos pés.
    const pivot = a === "dodge" ? 0.55 : 0;
    const by = bob + lift + Math.sin(this.t * 2) * 0.008;
    this.body.position.y += (by + pivot - pivot * Math.cos(this.body.rotation.x) - this.body.position.y) * damp(dt, 25);
    this.body.position.z = a === "dodge" ? pivot * Math.sin(this.body.rotation.x) : 0;

    // Poncho: atrasa com a velocidade e abre quando corre ou gira.
    const local = new THREE.Vector2(v.x, v.y).rotateAround(new THREE.Vector2(), this.heading);
    const flare = 1 + Math.min(0.35, speed * 0.04) + (a === "spin" ? 0.4 : 0);
    this.poncho.scale.set(flare, 1, flare);
    this.poncho.rotation.x += (-local.y * 0.04 - this.j.spine!.rotation.x * 0.5 - this.poncho.rotation.x) * damp(dt, 8);
    this.poncho.rotation.z += (local.x * 0.04 - this.poncho.rotation.z) * damp(dt, 8);
  }

  private updateTrail() {
    const slashing = this.action && ["slash1", "slash2", "slash3", "spin", "charge"].includes(this.action);
    this.root.updateMatrixWorld(true);
    if (slashing) {
      this.trailPts.unshift(this.bladeTip.getWorldPosition(new THREE.Vector3()), this.bladeBase.getWorldPosition(new THREE.Vector3()));
      this.trailPts.length = Math.min(this.trailPts.length, 14);
    } else if (this.trailPts.length) this.trailPts.splice(-2, 2);
    const pos = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const al = this.trail.geometry.getAttribute("alpha") as THREE.BufferAttribute;
    for (let i = 0; i < 32; i++) {
      const p = this.trailPts[i] ?? this.trailPts[this.trailPts.length - 1 - ((this.trailPts.length - 1 - i) % 2)] ?? this.position;
      pos.setXYZ(i, p.x, p.y, p.z);
      al.setX(i, i < this.trailPts.length ? (1 - i / 14) * (i % 2 === 0 ? 1 : 0.2) : 0);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }

  private sync() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
  }
}
