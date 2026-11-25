import * as THREE from "three";
import { instantiate, loadModel } from "../world/models";
import { SkinnedRig } from "../world/skinned";

const JOINTS = ["hips", "spine", "chest", "neck", "shoulderL", "elbowL", "shoulderR", "elbowR", "thighL", "kneeL", "footL", "thighR", "kneeR", "footR"];

/**
 * Vitrine 3D da tela de seleção: o modelo da classe girando devagar sobre um disco iluminado,
 * com os braços baixados (mesmo SkinnedRig do jogo) e respiração. Arrastar gira o personagem.
 */
export class CharacterPreview {
  readonly canvas = document.createElement("canvas");
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private holder = new THREE.Group();
  private current?: { id: string; model: THREE.Object3D; rig: SkinnedRig; j: Record<string, THREE.Object3D> };
  private wanted = "";
  private spin = 0.6;
  private drag?: number;
  private running = false;
  private last = 0;
  private t = 0;
  onLoading?: (loading: boolean) => void;

  constructor() {
    this.canvas.className = "preview";
    this.scene.add(new THREE.HemisphereLight(0x9fb0d0, 0x1a1410, 1.4));
    const key = new THREE.DirectionalLight(0xffd9a8, 3.2);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0x7fa0ff, 2.4);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(key, rim);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf0b44a, transparent: true, opacity: 0.12 }),
    );
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 0.92, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0b44a, transparent: true, opacity: 0.6 }));
    this.scene.add(disc, ring, this.holder);
    this.camera.position.set(0, 1.25, 4.6);
    this.camera.lookAt(0, 0.95, 0);
    this.canvas.addEventListener("pointerdown", (e) => {
      this.drag = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.drag === undefined) return;
      this.holder.rotation.y += (e.clientX - this.drag) * 0.012;
      this.drag = e.clientX;
    });
    this.canvas.addEventListener("pointerup", () => (this.drag = undefined));
  }

  async show(id: string) {
    this.wanted = id;
    if (this.current?.id === id) return;
    this.onLoading?.(true);
    try {
      const asset = await loadModel(id, false);
      if (this.wanted !== id) return;
      const model = instantiate(asset);
      // Normaliza a altura para 1,8 m e põe os pés no chão.
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y || 1.8;
      const s = 1.8 / h;
      model.scale.multiplyScalar(s);
      model.position.y -= box.min.y * s;
      const j: Record<string, THREE.Object3D> = {};
      for (const n of JOINTS) j[n] = new THREE.Object3D();
      const rig = new SkinnedRig(model, j);
      if (this.current) this.holder.remove(this.current.model);
      this.holder.add(model);
      this.current = { id, model, rig, j };
    } catch (e) {
      console.warn("prévia do personagem não carregou", e);
    } finally {
      if (this.wanted === id) this.onLoading?.(false);
    }
  }

  start() {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
  }

  private frame(dt: number) {
    const r = this.renderer!;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.floor(w * r.getPixelRatio()) || this.canvas.height !== Math.floor(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.t += dt;
    if (this.drag === undefined) this.holder.rotation.y += dt * this.spin;
    const c = this.current;
    if (c) {
      const t = this.t;
      c.j.chest!.rotation.x = Math.sin(t * 1.6) * 0.03;
      c.j.hips!.rotation.z = Math.sin(t * 0.5) * 0.03;
      c.j.shoulderL!.rotation.z = 0.08 + Math.sin(t * 1.6) * 0.02;
      c.j.shoulderR!.rotation.z = -0.08 - Math.sin(t * 1.6) * 0.02;
      c.j.elbowL!.rotation.x = -0.2;
      c.j.elbowR!.rotation.x = -0.2;
      c.rig.apply();
    }
    r.render(this.scene, this.camera);
  }
}
