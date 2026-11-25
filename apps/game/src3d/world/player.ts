import * as THREE from "three";

/** Metros por segundo andando (GameRules.playerSpeedMetersPerSecond). */
const WALK_MPS = 4;
const RUN_FACTOR = 2.2;

const mat = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });

/**
 * Personagem provisório em low-poly: forasteiro de poncho e chapéu, com lampião na mão.
 * Anda no plano XZ em metros, colide pela função isBlocked e gira para onde anda.
 */
export class Player {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  private body = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armR: THREE.Group;
  private lantern: THREE.PointLight;
  private heading = 0;
  private walk = 0;
  private swingT = 0;
  private swingKind: "slash" | "spin" = "slash";
  private faceTarget?: THREE.Vector3;
  moving = false;

  constructor(x: number, z: number, private isBlocked: (x: number, z: number) => boolean) {
    this.position.set(x, 0, z);
    const pants = mat(0x2a2622);
    const boots = mat(0x15120f);
    const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.22).translate(0, -0.4, 0);
    const mkLeg = (side: number) => {
      const leg = new THREE.Mesh(legGeo, pants);
      leg.position.set(0.13 * side, 0.85, 0);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.32), boots);
      boot.position.set(0, -0.75, 0.04);
      leg.add(boot);
      return leg;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    // Poncho: pirâmide de base quadrada, cor de barro com uma faixa.
    const poncho = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 0.75, 4, 1).rotateY(Math.PI / 4), mat(0x8c3b26, 0.9));
    poncho.position.y = 1.2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.47, 0.08, 4, 1).rotateY(Math.PI / 4), mat(0xd9b25a, 0.9));
    band.position.y = 1.0;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.26), mat(0x3a2f26));
    torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat(0xc79a72, 0.7));
    head.position.y = 1.72;
    const lenco = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 8), mat(0xb02020));
    lenco.position.y = 1.58;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 18), mat(0x3b2a1c));
    brim.position.y = 1.82;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 14), mat(0x3b2a1c));
    crown.position.y = 1.91;
    // Braço com o lampião.
    this.armR = new THREE.Group();
    this.armR.position.set(0.32, 1.42, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(0, -0.27, 0), mat(0x3a2f26));
    // Facão na mão direita.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.75).translate(0, 0, 0.42), new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.25 }));
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.16), mat(0x2a1a10));
    const weapon = new THREE.Group();
    weapon.add(blade, hilt);
    weapon.position.set(0, -0.6, 0.05);
    this.armR.add(arm, weapon);
    // Lampião na mão esquerda.
    const armL = new THREE.Group();
    armL.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(0, -0.27, 0), mat(0x3a2f26)));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffa040, emissiveIntensity: 5 }));
    lamp.position.set(-0.02, -0.66, 0.06);
    armL.add(lamp);
    armL.position.set(-0.32, 1.42, 0);
    armL.rotation.z = -0.15;
    this.body.add(this.legL, this.legR, torso, poncho, band, head, lenco, brim, crown, this.armR, armL);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    // Luz do lampião: pequena e quente, para o personagem nunca ficar no escuro.
    this.lantern = new THREE.PointLight(0xffa552, 6, 9, 1.6);
    this.lantern.position.set(-0.4, 0.9, 0.3);
    this.root.add(this.body, this.lantern);
    this.sync();
  }

  /** dir: direção desejada no plano XZ (já relativa à câmera), comprimento 0 a 1. */
  update(dt: number, dir: THREE.Vector2, run: boolean, time: number) {
    const len = dir.length();
    this.moving = len > 0.01;
    if (this.moving) {
      const speed = WALK_MPS * (run ? RUN_FACTOR : 1) * Math.min(1, len);
      const step = (speed * dt) / len;
      const nx = this.position.x + dir.x * step;
      const nz = this.position.z + dir.y * step;
      // Desliza na parede: testa cada eixo separado, com uma folga de 0,3 m no sentido do movimento.
      const pad = 0.3;
      if (!this.isBlocked(nx + Math.sign(dir.x) * pad, this.position.z)) this.position.x = nx;
      if (!this.isBlocked(this.position.x, nz + Math.sign(dir.y) * pad)) this.position.z = nz;
      this.walk += dt * speed * 2.2;
    } else {
      this.walk *= 0.8;
    }
    // Olha para o alvo quando ataca; senão, para onde anda.
    const look = this.faceTarget ? Math.atan2(this.faceTarget.x - this.position.x, this.faceTarget.z - this.position.z) : this.moving ? Math.atan2(dir.x, dir.y) : undefined;
    if (look !== undefined) {
      let d = look - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 14);
    }
    const swing = this.moving ? Math.sin(this.walk) * 0.7 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armR.rotation.x = -swing * 0.4 - 0.15;
    this.armR.rotation.y = 0;
    this.body.rotation.y = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt);
      const k = 1 - this.swingT / 0.32;
      if (this.swingKind === "spin") this.body.rotation.y = k * Math.PI * 2;
      // Golpe: braço sobe para trás e desce cortando na diagonal.
      this.armR.rotation.x = k < 0.35 ? -2.6 * (k / 0.35) : -2.6 + 3.4 * ((k - 0.35) / 0.65);
      this.armR.rotation.y = k < 0.35 ? 0.4 : 0.4 - 1.2 * ((k - 0.35) / 0.65);
    }
    this.body.position.y = this.moving ? Math.abs(Math.cos(this.walk)) * 0.05 : Math.sin(time * 2) * 0.01;
    this.lantern.intensity = 6 + Math.sin(time * 13) * 0.3 + Math.sin(time * 7.3) * 0.4;
    this.sync();
  }

  /** Anima um golpe; `spin` gira o corpo inteiro (ataque em área). */
  swing(kind: "slash" | "spin" = "slash") {
    this.swingT = 0.32;
    this.swingKind = kind;
  }

  /** Mantém o personagem virado para um ponto (o alvo) até receber undefined. */
  face(p?: THREE.Vector3) {
    this.faceTarget = p;
  }

  get facing() {
    return this.heading;
  }

  private sync() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
  }
}
