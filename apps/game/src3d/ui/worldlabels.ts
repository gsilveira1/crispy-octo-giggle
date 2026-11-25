import * as THREE from "three";
import type { Marker, Markers, StreetAnchor } from "./citymap";
import { formatDistance } from "./minimap";

const v = new THREE.Vector3();
const w = new THREE.Vector3();

/**
 * Nomes de rua na tela, presos ao traçado: o texto segue a direção da rua (sempre em pé para leitura)
 * e some quando encosta em outro. Funciona em qualquer zoom porque é HTML por cima do 3D.
 */
export class StreetLabels {
  private pool: HTMLElement[] = [];
  visible = true;

  constructor(private root: HTMLElement, private anchors: StreetAnchor[]) {}

  private el(i: number) {
    let e = this.pool[i];
    if (!e) {
      e = document.createElement("div");
      e.className = "street";
      this.root.appendChild(e);
      this.pool.push(e);
    }
    return e;
  }

  update(camera: THREE.PerspectiveCamera, focus: THREE.Vector3, viewRadius: number) {
    let used = 0;
    if (this.visible) {
      const boxes: [number, number, number, number][] = [];
      // Ruas longas e próximas do centro primeiro; muito afastado, só as maiores.
      const minRun = viewRadius > 500 ? 260 : viewRadius > 220 ? 120 : 40;
      const cand = this.anchors
        .filter((a) => a.runLength >= minRun && Math.abs(a.x - focus.x) < viewRadius && Math.abs(a.z - focus.z) < viewRadius)
        .map((a) => ({ a, d: Math.hypot(a.x - focus.x, a.z - focus.z) - a.runLength * 0.15 }))
        .sort((p, q) => p.d - q.d);
      const seen = new Set<string>();
      for (const { a } of cand) {
        if (used >= 36) break;
        if (viewRadius > 220 && seen.has(a.name)) continue;
        v.set(a.x, 0.05, a.z).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
        w.set(a.x + Math.cos(a.angle) * 4, 0.05, a.z + Math.sin(a.angle) * 4).project(camera);
        const x = (v.x * 0.5 + 0.5) * innerWidth;
        const y = (-v.y * 0.5 + 0.5) * innerHeight;
        let ang = Math.atan2(-(w.y - v.y) * innerHeight, (w.x - v.x) * innerWidth);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        const tw = a.name.length * 6.6 + 8;
        const bw = Math.abs(Math.cos(ang)) * tw + Math.abs(Math.sin(ang)) * 14;
        const bh = Math.abs(Math.sin(ang)) * tw + Math.abs(Math.cos(ang)) * 14;
        if (boxes.some(([bx, by, ww, hh]) => Math.abs(bx - x) * 2 < bw + ww && Math.abs(by - y) * 2 < bh + hh)) continue;
        boxes.push([x, y, bw, bh]);
        seen.add(a.name);
        const e = this.el(used++);
        if (e.textContent !== a.name) e.textContent = a.name;
        e.style.display = "block";
        e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${ang.toFixed(3)}rad)`;
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.style.display = "none";
  }
}

/** Facho de luz no mundo para cada marca, com nome e distância (presos na borda da tela quando fora dela). */
export class MarkerBeacons {
  private items = new Map<number, { mk: Marker; beam: THREE.Mesh; label: HTMLElement }>();
  private geo = new THREE.CylinderGeometry(0.5, 0.9, 60, 12, 1, true).translate(0, 30, 0);
  private tex: THREE.Texture;

  constructor(private scene: THREE.Scene, private root: HTMLElement, private markers: Markers) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0.9)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    this.tex = new THREE.CanvasTexture(c);
    markers.onChange(() => this.sync());
    this.sync();
  }

  private sync() {
    for (const [id, it] of this.items)
      if (!this.markers.list.some((m) => m.id === id)) {
        this.scene.remove(it.beam);
        (it.beam.material as THREE.Material).dispose();
        it.label.remove();
        this.items.delete(id);
      }
    for (const mk of this.markers.list) {
      const it = this.items.get(mk.id);
      if (it) {
        it.mk = mk;
        continue;
      }
      const beam = new THREE.Mesh(
        this.geo,
        new THREE.MeshBasicMaterial({ color: mk.color, map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
      );
      beam.position.set(mk.x, 0, mk.z);
      beam.renderOrder = 3;
      this.scene.add(beam);
      const label = document.createElement("div");
      label.className = "marker";
      label.style.setProperty("--c", mk.color);
      this.root.appendChild(label);
      this.items.set(mk.id, { mk, beam, label });
    }
  }

  update(camera: THREE.PerspectiveCamera, player: THREE.Vector3, t: number) {
    for (const { mk, beam, label } of this.items.values()) {
      const d = Math.hypot(mk.x - player.x, mk.z - player.z);
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 3 + mk.id) * 0.15;
      // Chegou perto: o facho apaga para não atrapalhar.
      beam.visible = d > 6;
      label.textContent = `${mk.name} · ${formatDistance(d)}`;
      v.set(mk.x, 3, mk.z).project(camera);
      let x = v.x;
      let y = v.y;
      const behind = v.z > 1;
      if (behind) {
        x = -x;
        y = -y;
      }
      const off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.88;
      if (off) {
        const s = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.88);
        x /= s;
        y /= s;
      }
      label.classList.toggle("edge", off);
      label.style.transform = `translate(${((x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
