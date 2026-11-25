import type { TileManifest } from "@bigriver/shared";
import { drawPin, drawPlayer, drawRefuge, type CityImage, type MapState, type Markers, type StreetAnchor } from "./citymap";

const SIZE = 196;

/**
 * Minimapa redondo no canto: gira junto com a câmera (cima = para onde a câmera olha).
 * Clique esquerdo marca um ponto; clique direito numa marca apaga; + e − mudam o zoom; M abre o mapa grande.
 */
export class Minimap {
  readonly el: HTMLElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private north: HTMLElement;
  /** Pixels por metro. */
  zoom = 1.1;
  private state?: MapState;

  constructor(private image: CityImage, private markers: Markers, onOpenMap: () => void) {
    this.el = document.createElement("div");
    this.el.id = "minimap";
    this.el.innerHTML = `
      <canvas width="${SIZE * 2}" height="${SIZE * 2}"></canvas>
      <b class="north">N</b>
      <div class="mm-btns"><button data-z="+" title="Aproximar">+</button><button data-z="-" title="Afastar">−</button><button data-open title="Mapa da cidade (M)">M</button></div>
`;
    this.cv = this.el.querySelector("canvas")!;
    this.g = this.cv.getContext("2d")!;
    this.north = this.el.querySelector(".north")!;
    this.el.querySelectorAll<HTMLButtonElement>("[data-z]").forEach((b) =>
      b.addEventListener("click", () => {
        this.zoom = Math.min(4, Math.max(0.25, this.zoom * (b.dataset.z === "+" ? 1.4 : 1 / 1.4)));
      }),
    );
    this.el.querySelector("[data-open]")!.addEventListener("click", onOpenMap);
    this.cv.addEventListener("contextmenu", (e) => e.preventDefault());
    this.cv.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const w = this.toWorld(e);
      if (!w) return;
      if (e.button === 2) {
        const mk = this.markers.near(w.x, w.z, 12 / this.zoom);
        if (mk) this.markers.remove(mk.id);
      } else if (e.button === 0) this.markers.add(w.x, w.z);
    });
    this.cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.zoom = Math.min(4, Math.max(0.25, this.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
    }, { passive: false });
  }

  private toWorld(e: PointerEvent) {
    if (!this.state) return;
    const r = this.cv.getBoundingClientRect();
    const sx = e.clientX - r.left - r.width / 2;
    const sy = e.clientY - r.top - r.height / 2;
    if (Math.hypot(sx, sy) > r.width / 2) return;
    // Desfaz o giro do mapa.
    const a = -this.state.yaw;
    const dx = sx * Math.cos(a) - sy * Math.sin(a);
    const dz = sx * Math.sin(a) + sy * Math.cos(a);
    return { x: this.state.x + dx / this.zoom, z: this.state.z + dz / this.zoom };
  }

  draw(s: MapState) {
    this.state = s;
    const g = this.g;
    const R = SIZE;
    g.setTransform(2, 0, 0, 2, 0, 0); // canvas em 2× para ficar nítido
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(R / 2, R / 2, R / 2 - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#15171b";
    g.fillRect(0, 0, R, R);
    g.translate(R / 2, R / 2);
    g.rotate(s.yaw);
    const k = this.zoom;
    g.save();
    g.scale(k / this.image.pxPerM, k / this.image.pxPerM);
    g.translate(-s.x * this.image.pxPerM, -s.z * this.image.pxPerM);
    g.imageSmoothingEnabled = k < this.image.pxPerM * 1.5;
    g.drawImage(this.image.canvas, 0, 0);
    g.restore();
    // De volta a pixels de tela, ainda girado: cada objeto é posicionado e "desgirado" para ficar em pé.
    const at = (x: number, z: number) => [(x - s.x) * k, (z - s.z) * k] as const;
    const upright = (x: number, z: number, fn: () => void) => {
      const [px, py] = at(x, z);
      g.save();
      g.translate(px, py);
      g.rotate(-s.yaw);
      fn();
      g.restore();
    };
    g.fillStyle = "#9ad08a";
    for (const v of s.survivors) {
      const [px, py] = at(v.x, v.z);
      g.beginPath();
      g.arc(px, py, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#ff4a3a";
    for (const e of s.enemies) {
      const [px, py] = at(e.x, e.z);
      g.beginPath();
      g.arc(px, py, 3, 0, Math.PI * 2);
      g.fill();
    }
    upright(s.refuge.x, s.refuge.z, () => drawRefuge(g, 0, 0));
    for (const mk of this.markers.list) {
      const [px, py] = at(mk.x, mk.z);
      const d = Math.hypot(px, py);
      const max = R / 2 - 12;
      if (d > max) {
        // Fora do alcance: seta na borda apontando para a marca.
        const ux = px / d;
        const uy = py / d;
        g.save();
        g.translate(ux * max, uy * max);
        g.rotate(Math.atan2(uy, ux));
        g.fillStyle = mk.color;
        g.strokeStyle = "#000";
        g.beginPath();
        g.moveTo(7, 0);
        g.lineTo(-4, -5);
        g.lineTo(-4, 5);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      } else upright(mk.x, mk.z, () => drawPin(g, 0, 0, mk.color));
    }
    g.restore();
    // Jogador sempre no centro; a seta gira com o personagem relativo à câmera.
    drawPlayer(g, R / 2, R / 2, Math.PI - s.facing + s.yaw);
    this.north.style.transform = `translate(-50%, -50%) rotate(${s.yaw}rad) translateY(-${R / 2 - 2}px) rotate(${-s.yaw}rad)`;
  }
}

/**
 * Mapa da cidade inteira (tecla M): norte para cima, roda para zoom, arrastar para mover.
 * Clique marca um ponto, botão direito apaga; a lista ao lado renomeia e apaga.
 */
export class BigMap {
  readonly el: HTMLElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private listEl: HTMLElement;
  open = false;
  private cx = 0;
  private cz = 0;
  /** Pixels por metro. */
  private k = 1;
  private state?: MapState;
  private drag?: { x: number; y: number; cx: number; cz: number; moved: boolean };

  constructor(
    private manifest: TileManifest,
    private image: CityImage,
    private markers: Markers,
    private anchors: StreetAnchor[],
  ) {
    this.el = document.createElement("div");
    this.el.id = "bigmap";
    this.el.innerHTML = `
      <canvas></canvas>
      <aside>
        <h2>${manifest.name}</h2>
        <p class="hint">Clique no mapa para marcar um ponto. Botão direito apaga. Roda: zoom. Arrastar: mover.</p>
        <h3>Marcas</h3>
        <ol></ol>
        <button class="clear">Apagar todas</button>
        <button class="close">Fechar (M)</button>
      </aside>`;
    this.cv = this.el.querySelector("canvas")!;
    this.g = this.cv.getContext("2d")!;
    this.listEl = this.el.querySelector("ol")!;
    this.el.querySelector(".close")!.addEventListener("click", () => this.toggle(false));
    this.el.querySelector(".clear")!.addEventListener("click", () => this.markers.clear());
    markers.onChange(() => this.renderList());
    this.renderList();

    this.cv.addEventListener("contextmenu", (e) => e.preventDefault());
    this.cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const before = this.toWorld(e.clientX, e.clientY);
      this.k = Math.min(6, Math.max(this.fitScale() * 0.8, this.k * (e.deltaY > 0 ? 0.85 : 1.18)));
      const after = this.toWorld(e.clientX, e.clientY);
      this.cx += before.x - after.x;
      this.cz += before.z - after.z;
    }, { passive: false });
    this.cv.addEventListener("pointerdown", (e) => {
      if (e.button === 2) {
        const w = this.toWorld(e.clientX, e.clientY);
        const mk = this.markers.near(w.x, w.z, 14 / this.k);
        if (mk) this.markers.remove(mk.id);
        return;
      }
      if (e.button !== 0) return;
      this.cv.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false };
    });
    this.cv.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        this.cx = this.drag.cx - dx / this.k;
        this.cz = this.drag.cz - dy / this.k;
      }
    });
    this.cv.addEventListener("pointerup", (e) => {
      if (this.drag && !this.drag.moved) {
        const w = this.toWorld(e.clientX, e.clientY);
        this.markers.add(w.x, w.z);
      }
      this.drag = undefined;
    });
  }

  private fitScale() {
    const m = this.manifest.metersPerTile;
    return Math.min((this.cv.clientWidth || innerWidth) / (this.manifest.cols * m), (this.cv.clientHeight || innerHeight) / (this.manifest.rows * m)) * 0.95;
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.classList.toggle("open", this.open);
    if (this.open) {
      const m = this.manifest.metersPerTile;
      this.cx = (this.manifest.cols * m) / 2;
      this.cz = (this.manifest.rows * m) / 2;
      requestAnimationFrame(() => (this.k = this.fitScale()));
      this.k = this.fitScale();
    }
  }

  private toWorld(clientX: number, clientY: number) {
    const r = this.cv.getBoundingClientRect();
    return { x: this.cx + (clientX - r.left - r.width / 2) / this.k, z: this.cz + (clientY - r.top - r.height / 2) / this.k };
  }

  private renderList() {
    this.listEl.innerHTML = "";
    if (!this.markers.list.length) {
      this.listEl.innerHTML = `<li class="empty">Nenhuma marca ainda.</li>`;
      return;
    }
    for (const mk of this.markers.list) {
      const li = document.createElement("li");
      li.innerHTML = `<i style="background:${mk.color}"></i><input value="" maxlength="32"><span class="dist"></span><button title="Apagar">×</button>`;
      const input = li.querySelector("input")!;
      input.value = mk.name;
      input.addEventListener("change", () => this.markers.rename(mk.id, input.value));
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
      });
      li.querySelector("button")!.addEventListener("click", () => this.markers.remove(mk.id));
      li.querySelector("i")!.addEventListener("click", () => {
        this.cx = mk.x;
        this.cz = mk.z;
      });
      li.dataset.id = String(mk.id);
      this.listEl.appendChild(li);
    }
  }

  draw(s: MapState) {
    this.state = s;
    if (!this.open) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = this.cv.clientWidth;
    const H = this.cv.clientHeight;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) {
      this.cv.width = Math.round(W * dpr);
      this.cv.height = Math.round(H * dpr);
    }
    const g = this.g;
    const k = this.k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#101216";
    g.fillRect(0, 0, W, H);
    const sx = (x: number) => W / 2 + (x - this.cx) * k;
    const sy = (z: number) => H / 2 + (z - this.cz) * k;
    g.save();
    g.translate(sx(0), sy(0));
    g.scale(k / this.image.pxPerM, k / this.image.pxPerM);
    g.imageSmoothingEnabled = k < this.image.pxPerM * 1.5;
    g.drawImage(this.image.canvas, 0, 0);
    g.restore();

    // Nomes de rua ao longo do traçado, sem sobrepor; com pouco zoom só as ruas mais longas.
    const boxes: [number, number, number, number][] = [];
    const fits = (x: number, y: number, w: number, h: number) => {
      if (boxes.some(([bx, by, bw, bh]) => Math.abs(bx - x) * 2 < bw + w && Math.abs(by - y) * 2 < bh + h)) return false;
      boxes.push([x, y, w, h]);
      return true;
    };
    // Prédios importantes primeiro.
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "600 11px system-ui, sans-serif";
    for (const p of this.manifest.pois) {
      if (!p.name || !["civic", "religious", "education", "leisure", "health"].includes(p.category)) continue;
      const x = sx((p.tile[0] + 0.5) * this.manifest.metersPerTile);
      const y = sy((p.tile[1] + 0.5) * this.manifest.metersPerTile);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      const w = g.measureText(p.name).width;
      if (k < 0.9 && !fits(x, y - 9, w, 14)) continue;
      if (k >= 0.9) boxes.push([x, y - 9, w, 14]);
      g.fillStyle = "#f0b44a";
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "#000b";
      g.strokeText(p.name, x, y - 9);
      g.fillStyle = "#f3d9a4";
      g.fillText(p.name, x, y - 9);
    }
    const minRun = k < 0.6 ? 300 : k < 1 ? 160 : 40;
    const fontPx = Math.round(Math.min(13, Math.max(9, 9 + k * 2)));
    g.font = `500 ${fontPx}px system-ui, sans-serif`;
    const seen = new Set<string>();
    const sorted = [...this.anchors].sort((a, b) => b.runLength - a.runLength);
    for (const a of sorted) {
      if (a.runLength < minRun) continue;
      if (k < 1 && seen.has(a.name)) continue;
      const x = sx(a.x);
      const y = sy(a.z);
      if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
      const w = g.measureText(a.name).width;
      let ang = a.angle;
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      // Caixa aproximada do texto girado, para testar sobreposição.
      const bw = Math.abs(Math.cos(ang)) * w + Math.abs(Math.sin(ang)) * fontPx;
      const bh = Math.abs(Math.sin(ang)) * w + Math.abs(Math.cos(ang)) * fontPx;
      if (!fits(x, y, bw, bh)) continue;
      seen.add(a.name);
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.lineWidth = 3;
      g.strokeStyle = "#000c";
      g.strokeText(a.name, 0, 0);
      g.fillStyle = "#e9e4d8";
      g.fillText(a.name, 0, 0);
      g.restore();
    }

    drawRefuge(g, sx(s.refuge.x), sy(s.refuge.z));
    g.fillStyle = "#ff4a3a";
    for (const e of s.enemies) {
      g.beginPath();
      g.arc(sx(e.x), sy(e.z), 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const mk of this.markers.list) drawPin(g, sx(mk.x), sy(mk.z), mk.color, mk.name);
    drawPlayer(g, sx(s.x), sy(s.z), Math.PI - s.facing, 10);

    // Distância de cada marca na lista.
    for (const li of this.listEl.querySelectorAll<HTMLElement>("li[data-id]")) {
      const mk = this.markers.list.find((m) => String(m.id) === li.dataset.id);
      if (mk) li.querySelector(".dist")!.textContent = formatDistance(Math.hypot(mk.x - s.x, mk.z - s.z));
    }
  }
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
