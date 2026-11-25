import { decodeGround, Ground, type Point, type TileManifest } from "@bigriver/shared";
import { fetchChunk } from "../world/chunks";

/** Pixels por tile na imagem-base do mapa (2 tiles = 4 m → 1 px por metro com 2 m/tile). */
const PX = 2;

/** Cores do mapa, num tom escuro de papel velho que combina com a Cerração. */
const MAP_COLORS: Record<number, string> = {
  [Ground.ground]: "#2b2e33",
  [Ground.grass]: "#2f4a2d",
  [Ground.forest]: "#243a22",
  [Ground.water]: "#21465c",
  [Ground.road_major]: "#a39374",
  [Ground.road_minor]: "#6f6a60",
  [Ground.path]: "#5c5141",
  [Ground.rail]: "#4f4138",
  [Ground.plaza]: "#5a554c",
  [Ground.farmland]: "#3f3d29",
  [Ground.lot]: "#2b2e33",
};
const BUILDING = "#4b4f58";
const BUILDING_EDGE = "#1c1e22";

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
const RGB = Object.fromEntries(Object.entries(MAP_COLORS).map(([k, v]) => [k, rgb(v)])) as Record<number, readonly [number, number, number]>;

/** Ponto de rótulo de rua: posição em metros e ângulo do traçado (radianos, no plano x/z). */
export type StreetAnchor = { name: string; x: number; z: number; angle: number; runLength: number };

/**
 * Onde escrever o nome de cada rua. Os pontos do manifesto são amostras de vários trechos colados;
 * um salto maior que 6 tiles começa um trecho novo. Trechos com mais de 40 m ganham um rótulo
 * no meio e mais um a cada ~140 m.
 */
export function streetAnchors(manifest: TileManifest): StreetAnchor[] {
  const m = manifest.metersPerTile;
  const out: StreetAnchor[] = [];
  for (const s of manifest.streets) {
    const runs: Point[][] = [];
    let run: Point[] = [];
    let prev: Point | undefined;
    for (const p of s.points) {
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= 6) {
        runs.push(run);
        run = [];
      }
      run.push(p);
      prev = p;
    }
    runs.push(run);
    for (const r of runs) {
      if (r.length < 2) continue;
      const seg: number[] = [0];
      for (let i = 1; i < r.length; i++) seg.push(seg[i - 1]! + Math.hypot(r[i]![0] - r[i - 1]![0], r[i]![1] - r[i - 1]![1]) * m);
      const len = seg[seg.length - 1]!;
      if (len < 40) continue;
      const n = Math.max(1, Math.round(len / 140));
      for (let k = 0; k < n; k++) {
        const at = (len * (k + 0.5)) / n;
        let i = 1;
        while (i < r.length - 1 && seg[i]! < at) i++;
        const a = r[i - 1]!;
        const b = r[i]!;
        const f = seg[i]! > seg[i - 1]! ? (at - seg[i - 1]!) / (seg[i]! - seg[i - 1]!) : 0;
        out.push({
          name: s.name,
          x: (a[0] + (b[0] - a[0]) * f + 0.5) * m,
          z: (a[1] + (b[1] - a[1]) * f + 0.5) * m,
          angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
          runLength: len,
        });
      }
    }
  }
  return out;
}

/** Imagem da cidade inteira vista de cima, montada aos poucos a partir dos chunks. */
export class CityImage {
  readonly canvas = document.createElement("canvas");
  /** Pixels por metro da imagem. */
  readonly pxPerM: number;
  private g: CanvasRenderingContext2D;
  loaded = 0;

  constructor(private manifest: TileManifest, private baseUrl: string) {
    this.pxPerM = PX / manifest.metersPerTile;
    this.canvas.width = manifest.cols * PX;
    this.canvas.height = manifest.rows * PX;
    this.g = this.canvas.getContext("2d")!;
    this.g.fillStyle = MAP_COLORS[Ground.ground]!;
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Baixa todos os chunks (os que o mundo 3D já pediu vêm do cache) e desenha cada um. */
  async load() {
    const { chunksX, chunksY } = this.manifest;
    const keys: string[] = [];
    for (let y = 0; y < chunksY; y++) for (let x = 0; x < chunksX; x++) keys.push(`${x}_${y}`);
    // Poucos de cada vez para não disputar a rede com o mundo 3D.
    let next = 0;
    const worker = async () => {
      while (next < keys.length) {
        const key = keys[next++]!;
        try {
          this.draw(await fetchChunk(this.baseUrl, key));
        } catch (e) {
          console.warn("minimapa: chunk", key, e);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  private draw(chunk: { cx: number; cy: number; ground: string; buildings: { footprint: Point[] }[] }) {
    const s = this.manifest.chunkSize;
    const ground = decodeGround(chunk.ground);
    const ox = chunk.cx * s;
    const oy = chunk.cy * s;
    const w = Math.min(s, this.manifest.cols - ox);
    const h = Math.min(s, this.manifest.rows - oy);
    if (w <= 0 || h <= 0) return;
    const img = this.g.createImageData(w * PX, h * PX);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const [R, G, B] = RGB[ground[r * s + c]!] ?? RGB[Ground.ground]!;
        for (let dy = 0; dy < PX; dy++)
          for (let dx = 0; dx < PX; dx++) {
            const i = ((r * PX + dy) * w * PX + c * PX + dx) * 4;
            img.data[i] = R;
            img.data[i + 1] = G;
            img.data[i + 2] = B;
            img.data[i + 3] = 255;
          }
      }
    this.g.putImageData(img, ox * PX, oy * PX);
    this.g.fillStyle = BUILDING;
    this.g.strokeStyle = BUILDING_EDGE;
    this.g.lineWidth = 0.6;
    for (const b of chunk.buildings) {
      this.g.beginPath();
      b.footprint.forEach(([c, r], i) => (i ? this.g.lineTo(c * PX, r * PX) : this.g.moveTo(c * PX, r * PX)));
      this.g.closePath();
      this.g.fill();
      this.g.stroke();
    }
    this.loaded++;
  }
}

/** Ponto marcado pelo jogador. Guardado no navegador, por cidade. */
export type Marker = { id: number; x: number; z: number; name: string; color: string };
export const MARKER_COLORS = ["#ffcf4a", "#5ad1ff", "#ff6bb5", "#7dff8a", "#ff8a3d", "#c08bff"];
const MAX_MARKERS = 20;

export class Markers {
  list: Marker[] = [];
  private listeners: (() => void)[] = [];
  private key: string;

  constructor(cityId: string) {
    this.key = `bigriver.marcas.${cityId}`;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.list = (JSON.parse(raw) as Marker[]).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.z));
    } catch {
      /* sem armazenamento: as marcas valem só nesta aba */
    }
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  add(x: number, z: number): Marker {
    const id = Math.max(0, ...this.list.map((m) => m.id)) + 1;
    const mk: Marker = { id, x, z, name: `Marca ${id}`, color: MARKER_COLORS[(id - 1) % MARKER_COLORS.length]! };
    this.list.push(mk);
    if (this.list.length > MAX_MARKERS) this.list.shift();
    this.changed();
    return mk;
  }

  remove(id: number) {
    this.list = this.list.filter((m) => m.id !== id);
    this.changed();
  }

  rename(id: number, name: string) {
    const mk = this.list.find((m) => m.id === id);
    if (mk) mk.name = name.trim().slice(0, 32) || mk.name;
    this.changed();
  }

  clear() {
    this.list = [];
    this.changed();
  }

  /** A marca mais perto de (x, z) dentro de `radius` metros. */
  near(x: number, z: number, radius: number): Marker | undefined {
    let best: Marker | undefined;
    let bd = radius;
    for (const m of this.list) {
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < bd) [best, bd] = [m, d];
    }
    return best;
  }

  private changed() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.list));
    } catch {
      /* ignora */
    }
    for (const fn of this.listeners) fn();
  }
}

/** O que os mapas precisam saber do mundo a cada quadro. */
export type MapState = {
  x: number;
  z: number;
  /** Para onde o personagem olha (atan2(dx, dz)). */
  facing: number;
  /** Giro da câmera; o minimapa gira junto para "cima" ser sempre a frente da câmera. */
  yaw: number;
  refuge: { x: number; z: number };
  enemies: { x: number; z: number }[];
  survivors: { x: number; z: number }[];
};

export function drawPin(g: CanvasRenderingContext2D, x: number, y: number, color: string, label?: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = "#000";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-7, -9, -7, -17, 0, -17);
  g.bezierCurveTo(7, -17, 7, -9, 0, 0);
  g.fill();
  g.stroke();
  g.fillStyle = "#000a";
  g.beginPath();
  g.arc(0, -11.5, 2.6, 0, Math.PI * 2);
  g.fill();
  if (label) {
    g.font = "600 11px system-ui, sans-serif";
    g.textAlign = "center";
    g.lineWidth = 3;
    g.strokeStyle = "#000c";
    g.strokeText(label, 0, -21);
    g.fillStyle = color;
    g.fillText(label, 0, -21);
  }
  g.restore();
}

export function drawPlayer(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 8) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = "#fff";
  g.strokeStyle = "#000";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.7, size * 0.75);
  g.lineTo(0, size * 0.35);
  g.lineTo(-size * 0.7, size * 0.75);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

export function drawRefuge(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save();
  g.translate(x, y);
  g.fillStyle = "#f0b44a";
  g.strokeStyle = "#000";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(7, -1);
  g.lineTo(5, -1);
  g.lineTo(5, 6);
  g.lineTo(-5, 6);
  g.lineTo(-5, -1);
  g.lineTo(-7, -1);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}
