import * as THREE from "three";
import type { TileBuilding } from "@bigriver/shared";
import { canvas, canvasTexture, hash } from "./util";

/** Altura de um andar em metros. */
export const LEVEL_M = 2.8;
/** Largura desejada de uma "baia" de fachada (uma janela, porta ou vitrine). */
const BAY_M = 2.2;
/** Células do atlas de fachada, da esquerda para a direita. */
const CELL = { wall: 0, winDark: 1, winLit: 2, aptDark: 3, aptLit: 4, door: 5, rollup: 6, shopLit: 7 } as const;
const CELLS = 8;

/** Cores de fachada comuns no interior gaúcho, já um pouco gastas. */
const FACADES = ["#e3d7bb", "#e2cd8a", "#a9bfcc", "#d6a58e", "#b3c9a9", "#e6e2d9", "#c79a5c", "#bbaec7", "#a7a39b", "#9e5a43", "#d9c3a5", "#8fa6a0"];
const AWNINGS = ["#8e2a22", "#1f5b3a", "#24477a", "#b8862a", "#6b2a5a", "#3c3c3c"];
const SIGNS = [
  ["FARMÁCIA", "#1d7a3e", "#ffffff"], ["PADARIA", "#7a3b17", "#f6d8a0"], ["MERCADO", "#b22222", "#ffffff"],
  ["LANCHERIA", "#e0a020", "#3a1a00"], ["FERRAGEM", "#1f3f7a", "#ffd34a"], ["ARMAZÉM", "#3b5323", "#f0e6c8"],
  ["AGROPECUÁRIA", "#2d6a2d", "#ffffff"], ["SALÃO", "#7a1f5c", "#ffd0ec"], ["BAR", "#262626", "#ff9a3c"],
  ["ÓTICA", "#0f4c5c", "#ffffff"], ["AÇOUGUE", "#8b0000", "#ffffff"], ["LOTÉRICA", "#1450a0", "#ffd200"],
] as const;

/** Uniforms do recorte em volta do jogador: posição do jogador e da câmera em metros. */
export const occlusion = { uPlayer: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } };

/**
 * Recorta (com pontilhado) o que estiver entre a câmera e o jogador, para ele nunca sumir atrás
 * de um prédio. Funciona com os prédios fundidos num só mesh por chunk.
 */
function withOcclusionCutout<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (s) => {
    s.uniforms.uPlayer = occlusion.uPlayer;
    s.uniforms.uCam = occlusion.uCam;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldP;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldP;\nuniform vec3 uPlayer;\nuniform vec3 uCam;")
      .replace(
        "void main() {",
        `void main() {
          vec3 seg = uPlayer - uCam;
          float t = clamp(dot(vWorldP - uCam, seg) / dot(seg, seg), 0.0, 1.0);
          float d = length(vWorldP - (uCam + seg * t));
          vec2 toP = uPlayer.xz - uCam.xz;
          float ahead = dot(vWorldP.xz - uCam.xz, toP) / dot(toP, toP);
          if (t < 0.985 && ahead < 1.0 && vWorldP.y > 0.4) {
            float fade = smoothstep(3.0, 1.7, d);
            float dither = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125);
            if (fade * 0.92 > dither) discard;
          }`,
      );
  };
  return m;
}

type Mats = { wall: THREE.MeshStandardMaterial; tile: THREE.MeshStandardMaterial; slab: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial; sign: THREE.MeshStandardMaterial; tank: THREE.MeshStandardMaterial };
let mats: Mats | undefined;

function noiseFill(g: CanvasRenderingContext2D, w: number, h: number, seed: number, amount: number, dark = 0.12, light = 0.06) {
  for (let i = 0; i < w * h * amount; i++) {
    g.fillStyle = hash(i, seed, 1) > 0.5 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${dark})`;
    g.fillRect(hash(i, seed, 2) * w, hash(i, seed, 3) * h, 1 + hash(i, seed, 4) * 2, 1 + hash(i, seed, 5) * 2);
  }
}

/** Atlas de fachada (8 células de 64 px): parede, janelas com veneziana, janelas de apartamento, porta, porta de enrolar e vitrine. */
function facadeAtlas(): [THREE.Texture, THREE.Texture] {
  const P = 64;
  const [cv, g] = canvas(P * CELLS, P);
  const [ev, e] = canvas(P * CELLS, P);
  e.fillStyle = "#000";
  e.fillRect(0, 0, P * CELLS, P);
  for (let i = 0; i < CELLS; i++) {
    const x = i * P;
    g.fillStyle = "#ffffff";
    g.fillRect(x, 0, P, P);
    // Reboco: manchas e escorridos de umidade.
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(60,50,40,${0.04 + hash(i, k, 1) * 0.06})`;
      g.fillRect(x + hash(i, k, 2) * P, hash(i, k, 3) * P * 0.5, 2 + hash(i, k, 4) * 5, P * (0.3 + hash(i, k, 5) * 0.7));
    }
    // Linha do andar (laje) e rodapé sujo.
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(x, 0, P, 3);
    g.fillStyle = "rgba(40,30,20,0.18)";
    g.fillRect(x, P - 7, P, 7);
  }
  const win = (cell: number, lit: boolean, apt: boolean) => {
    const x = cell * P;
    const [wx, wy, ww, wh] = apt ? [10, 18, 44, 26] : [20, 16, 24, 30];
    g.fillStyle = "#e8e4da";
    g.fillRect(x + wx - 3, wy - 3, ww + 6, wh + 7);
    g.fillStyle = lit ? "#3a2410" : "#141b22";
    g.fillRect(x + wx, wy, ww, wh);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(x + wx + 2, wy + 2, ww / 2 - 3, wh - 4);
    g.fillStyle = "#cfc8b8";
    g.fillRect(x + wx + ww / 2 - 1, wy, 2, wh);
    if (apt) g.fillRect(x + wx, wy + wh / 2 - 1, ww, 2);
    else {
      // Venezianas de madeira abertas dos dois lados.
      g.fillStyle = "#6b4a2c";
      g.fillRect(x + wx - 12, wy - 2, 9, wh + 4);
      g.fillRect(x + wx + ww + 3, wy - 2, 9, wh + 4);
      g.fillStyle = "rgba(0,0,0,0.3)";
      for (let k = wy; k < wy + wh; k += 4) {
        g.fillRect(x + wx - 12, k, 9, 1);
        g.fillRect(x + wx + ww + 3, k, 9, 1);
      }
    }
    // Peitoril.
    g.fillStyle = "#bdb6a6";
    g.fillRect(x + wx - 4, wy + wh + 3, ww + 8, 3);
    if (lit) {
      const grad = e.createLinearGradient(0, wy, 0, wy + wh);
      grad.addColorStop(0, "#ffb050");
      grad.addColorStop(1, "#ff8a2a");
      e.fillStyle = grad;
      e.fillRect(x + wx, wy, ww, wh);
      e.fillStyle = "#000";
      e.fillRect(x + wx + ww / 2 - 1, wy, 2, wh);
      // Cortina meio fechada.
      e.fillStyle = "rgba(0,0,0,0.55)";
      e.fillRect(x + wx, wy, ww * 0.3, wh);
    }
  };
  win(CELL.winDark, false, false);
  win(CELL.winLit, true, false);
  win(CELL.aptDark, false, true);
  win(CELL.aptLit, true, true);
  // Porta de madeira com moldura e degrau.
  {
    const x = CELL.door * P;
    g.fillStyle = "#d9d3c4";
    g.fillRect(x + 17, 10, 30, P - 12);
    g.fillStyle = "#4a3020";
    g.fillRect(x + 20, 13, 24, P - 15);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(x + 23, 17, 8, 18);
    g.fillRect(x + 33, 17, 8, 18);
    g.fillRect(x + 23, 39, 8, 18);
    g.fillRect(x + 33, 39, 8, 18);
    g.fillStyle = "#c9a04a";
    g.fillRect(x + 39, 37, 2, 3);
    g.fillStyle = "#8d877a";
    g.fillRect(x + 14, P - 3, 36, 3);
  }
  // Porta de enrolar fechada, com pichação.
  {
    const x = CELL.rollup * P;
    g.fillStyle = "#8f9396";
    g.fillRect(x + 3, 6, P - 6, P - 6);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let k = 8; k < P; k += 3) g.fillRect(x + 3, k, P - 6, 1);
    g.fillStyle = "#5c5f62";
    g.fillRect(x + 3, 4, P - 6, 4);
    g.strokeStyle = "rgba(30,30,30,0.7)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 12, 44);
    g.bezierCurveTo(x + 20, 30, x + 30, 52, x + 40, 36);
    g.lineTo(x + 50, 46);
    g.stroke();
  }
  // Vitrine acesa.
  {
    const x = CELL.shopLit * P;
    g.fillStyle = "#2a2a2a";
    g.fillRect(x + 3, 6, P - 6, P - 6);
    g.fillStyle = "#3a2c1c";
    g.fillRect(x + 6, 9, P - 12, P - 15);
    e.fillStyle = "#ffd9a0";
    e.fillRect(x + 6, 9, P - 12, P - 15);
    e.fillStyle = "rgba(0,0,0,0.5)";
    e.fillRect(x + 31, 9, 2, P - 15);
    for (let k = 0; k < 5; k++) e.fillRect(x + 8 + hash(k, 1) * 44, 30 + hash(k, 2) * 20, 4 + hash(k, 3) * 6, 10);
  }
  noiseFill(g, P * CELLS, P, 7, 0.02);
  return [canvasTexture(cv), canvasTexture(ev)];
}

/** Telha cerâmica (capa e canal), em 2 m × 2 m de telhado, repetível. */
function roofTileTexture(): THREE.Texture {
  const S = 128;
  const [cv, g] = canvas(S, S);
  g.fillStyle = "#c9c9c9";
  g.fillRect(0, 0, S, S);
  const cols = 8;
  const rows = 6;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * (S / cols) + (r % 2 ? S / cols / 2 : 0);
      const y = r * (S / rows);
      const v = 0.85 + hash(c, r, 3) * 0.3;
      const grad = g.createLinearGradient(x, 0, x + S / cols, 0);
      grad.addColorStop(0, `rgb(${120 * v},${120 * v},${120 * v})`);
      grad.addColorStop(0.5, `rgb(${255 * v},${255 * v},${255 * v})`);
      grad.addColorStop(1, `rgb(${120 * v},${120 * v},${120 * v})`);
      g.fillStyle = grad;
      g.fillRect(x, y, S / cols, S / rows);
      g.fillRect(x - S, y, S / cols, S / rows);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x - S, y + S / rows - 2, S * 2, 2);
    }
  // Limo e sujeira.
  for (let i = 0; i < 25; i++) {
    const x = hash(i, 4) * S;
    const y = hash(i, 5) * S;
    const r = 4 + hash(i, 6) * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(30,40,20,0.35)");
    grad.addColorStop(1, "rgba(30,40,20,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvasTexture(cv, true, true);
}

function slabTexture(): THREE.Texture {
  const S = 128;
  const [cv, g] = canvas(S, S);
  g.fillStyle = "#9c978e";
  g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, 3, 0.15, 0.15, 0.08);
  for (let i = 0; i < 10; i++) {
    const x = hash(i, 8) * S;
    const y = hash(i, 9) * S;
    const r = 8 + hash(i, 10) * 24;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(20,22,24,0.4)");
    grad.addColorStop(1, "rgba(20,22,24,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 0, S, 1);
  g.fillRect(0, 0, 1, S);
  return canvasTexture(cv, true, true);
}

function metalTexture(): THREE.Texture {
  const S = 64;
  const [cv, g] = canvas(S, S);
  for (let x = 0; x < S; x++) {
    const v = 150 + Math.sin((x / S) * Math.PI * 16) * 40;
    g.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    g.fillRect(x, 0, 1, S);
  }
  g.fillStyle = "rgba(110,60,30,0.25)";
  for (let i = 0; i < 30; i++) g.fillRect(hash(i, 1) * S, hash(i, 2) * S, 2, 3 + hash(i, 3) * 10);
  return canvasTexture(cv, true, true);
}

function signTexture(): THREE.Texture {
  const W = 512;
  const H = 64;
  const [cv, g] = canvas(W, H * SIGNS.length);
  SIGNS.forEach(([text, bg, fg], i) => {
    const y = i * H;
    g.fillStyle = bg;
    g.fillRect(0, y, W, H);
    g.fillStyle = "rgba(255,255,255,0.15)";
    g.fillRect(0, y + 4, W, 3);
    g.fillStyle = fg;
    g.font = "bold 40px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, W / 2, y + H / 2 + 2);
    if (text === "FARMÁCIA") {
      g.fillRect(24, y + 22, 30, 10);
      g.fillRect(34, y + 12, 10, 30);
    }
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, y + H - 5, W, 5);
  });
  return canvasTexture(cv);
}

function materials(): Mats {
  if (mats) return mats;
  const [map, emissiveMap] = facadeAtlas();
  const sign = signTexture();
  mats = {
    wall: withOcclusionCutout(new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1, vertexColors: true, roughness: 0.9 })),
    tile: withOcclusionCutout(new THREE.MeshStandardMaterial({ map: roofTileTexture(), vertexColors: true, roughness: 0.7 })),
    slab: withOcclusionCutout(new THREE.MeshStandardMaterial({ map: slabTexture(), vertexColors: true, roughness: 0.95 })),
    metal: withOcclusionCutout(new THREE.MeshStandardMaterial({ map: metalTexture(), vertexColors: true, roughness: 0.45, metalness: 0.6 })),
    trim: withOcclusionCutout(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })),
    sign: withOcclusionCutout(new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 })),
    tank: new THREE.MeshStandardMaterial({ color: 0x2c64a8, roughness: 0.4 }),
  };
  return mats;
}

/** Acumula triângulos com normal, UV e cor; vira um BufferGeometry no fim. */
class Geo {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();

  /** Triângulo; a ordem é ajustada para a normal apontar para o lado de `facing`. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: number[], ub: number[], uc: number[], color: THREE.Color, facing: THREE.Vector3) {
    const n = this.v.subVectors(b, a).cross(this.w.subVectors(c, a)).normalize();
    if (n.dot(facing) < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
      n.negate();
    }
    for (const [p, t] of [[a, ua], [b, ub], [c, uc]] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(t[0]!, t[1]!);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ua: number[], ub: number[], uc: number[], ud: number[], color: THREE.Color, facing: THREE.Vector3) {
    this.tri(a, b, c, ua, ub, uc, color, facing);
    this.tri(a, c, d, ua, uc, ud, color, facing);
  }

  mesh(material: THREE.Material): THREE.Mesh | undefined {
    if (!this.pos.length) return undefined;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    const m = new THREE.Mesh(g, material);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

function inside(x: number, z: number, poly: [number, number][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

function polyArea(ring: [number, number][]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]!;
    const [x2, z2] = ring[(i + 1) % ring.length]!;
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/** Retângulo orientado de menor área (testando a direção de cada aresta). */
function obb(ring: [number, number][]) {
  let best = { area: Infinity, cx: 0, cz: 0, ux: 1, uz: 0, a: 0, b: 0 };
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]!;
    const [x2, z2] = ring[(i + 1) % ring.length]!;
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l < 0.01) continue;
    const ux = (x2 - x1) / l;
    const uz = (z2 - z1) / l;
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, z] of ring) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) {
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      best = { area, cx: cu * ux - cv * uz, cz: cu * uz + cv * ux, ux, uz, a: (u1 - u0) / 2, b: (v1 - v0) / 2 };
    }
  }
  // Eixo u sempre no lado comprido (a cumeeira corre ao longo dele).
  if (best.b > best.a) best = { ...best, ux: -best.uz, uz: best.ux, a: best.b, b: best.a };
  return best;
}

export type Tanks = { x: number; y: number; z: number; s: number }[];

/**
 * Prédios de um chunk. Quase todos vêm do Google Open Buildings sem tipo, então o estilo é
 * inferido pelo tamanho, pelo número de andares e pela rua em frente:
 * - casa pequena e retangular: telhado de telha (quatro águas ou duas águas com oitão);
 * - prédio maior: laje com platibanda e caixa d'água; galpão grande: telhado de zinco;
 * - fachada virada para a rua pode ter comércio no térreo (vitrine, porta de enrolar, toldo e letreiro).
 */
export function buildBuildings(list: TileBuilding[], mpt: number, roadDistance: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group();
  if (list.length === 0) return group;
  const M = materials();
  const walls = new Geo();
  const tile = new Geo();
  const slab = new Geo();
  const metal = new Geo();
  const trim = new Geo();
  const signs = new Geo();
  const tanks: Tanks = [];
  const col = new THREE.Color();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  for (const b of list) {
    const ring = b.footprint.slice(0, -1).map(([x, z]) => [x * mpt, z * mpt] as [number, number]);
    if (ring.length < 3) continue;
    const seed = hash(Math.round(ring[0]![0] * 10), Math.round(ring[0]![1] * 10), 1);
    const h2 = (k: number) => hash(Math.round(seed * 1e6), k, 77);
    const area = polyArea(ring);
    const box = obb(ring);
    const rect = area / Math.max(1e-3, 4 * box.a * box.b);
    const levels = Math.min(b.levels, 12);
    const pitched = levels <= 2 && area < 260 && rect > 0.82 && box.b < 9 && h2(1) < 0.85;
    const shed = !pitched && area > 600;
    const facadeColor = col.set(FACADES[Math.floor(h2(2) * FACADES.length)]!).offsetHSL(0, 0, (h2(3) - 0.5) * 0.08).convertSRGBToLinear().clone();

    // Lados virados para a rua (até 5 m) recebem porta e, às vezes, comércio no térreo.
    const edges = ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      let nx = (q[1] - p[1]) / (len || 1);
      let nz = -(q[0] - p[0]) / (len || 1);
      if (inside((p[0] + q[0]) / 2 + nx * 0.05, (p[1] + q[1]) / 2 + nz * 0.05, ring)) [nx, nz] = [-nx, -nz];
      const street = len > 2 && roadDistance((p[0] + q[0]) / 2 + nx * 1.5, (p[1] + q[1]) / 2 + nz * 1.5) < 5;
      return { p, q, len, nx, nz, street };
    });
    const commercial = !shed && edges.some((e) => e.street) && h2(4) < (levels >= 2 ? 0.45 : 0.3);
    // Comércio térreo de um andar costuma ter platibanda alta na frente (fachada falsa).
    const wallH = levels * LEVEL_M + (pitched ? 0.2 : commercial && levels === 1 ? 1.3 : 0.7);
    const apt = levels >= 3;
    let doorDone = false;

    for (const e of edges) {
      if (e.len < 0.05) continue;
      const n = V(e.nx, 0, e.nz);
      const bays = Math.max(1, Math.round(e.len / BAY_M));
      const bw = e.len / bays;
      const dx = (e.q[0] - e.p[0]) / e.len;
      const dz = (e.q[1] - e.p[1]) / e.len;
      const rows = Math.ceil(wallH / LEVEL_M);
      for (let r = 0; r < rows; r++) {
        const y0 = r * LEVEL_M;
        const y1 = Math.min(wallH, y0 + LEVEL_M);
        for (let i = 0; i < bays; i++) {
          let cell: number = CELL.wall;
          const hv = h2(100 + r * 31 + i * 7 + Math.round(e.p[0] * 3));
          const partial = y1 - y0 < LEVEL_M * 0.9;
          if (partial || e.len < 1.6 || (shed && r === 0 && hv < 0.7)) cell = CELL.wall;
          else if (r === 0 && e.street && commercial) cell = hv < 0.45 ? CELL.shopLit : hv < 0.8 ? CELL.rollup : CELL.door;
          else if (r === 0 && e.street && !doorDone && i === Math.floor(bays / 2)) {
            cell = CELL.door;
            doorDone = true;
          } else if (hv < (e.street ? 0.15 : 0.45)) cell = CELL.wall;
          else cell = apt ? (hv < 0.68 ? CELL.aptLit : CELL.aptDark) : hv < 0.7 ? CELL.winLit : CELL.winDark;
          const u0 = (cell + 0.02) / CELLS;
          const u1 = (cell + 0.98) / CELLS;
          const v1 = partial ? (y1 - y0) / LEVEL_M : 1;
          const ax = e.p[0] + dx * bw * i;
          const az = e.p[1] + dz * bw * i;
          const bx = ax + dx * bw;
          const bz = az + dz * bw;
          walls.quad(V(ax, y0, az), V(bx, y0, bz), V(bx, y1, bz), V(ax, y1, az), [u0, 0], [u1, 0], [u1, v1], [u0, v1], facadeColor, n);
        }
      }
      // Toldo e letreiro no comércio.
      if (commercial && e.street && e.len > 2.5) {
        const awn = col.set(AWNINGS[Math.floor(h2(5) * AWNINGS.length)]!).convertSRGBToLinear().clone();
        const yA = 2.55;
        const out = 1.1;
        const a0 = V(e.p[0], yA + 0.25, e.p[1]);
        const b0 = V(e.q[0], yA + 0.25, e.q[1]);
        const a1 = V(e.p[0] + e.nx * out, yA - 0.2, e.p[1] + e.nz * out);
        const b1 = V(e.q[0] + e.nx * out, yA - 0.2, e.q[1] + e.nz * out);
        trim.quad(a0, b0, b1, a1, [0, 0], [1, 0], [1, 1], [0, 1], awn, V(e.nx, 1, e.nz));
        trim.quad(a1, b1, b1.clone().setY(yA - 0.45), a1.clone().setY(yA - 0.45), [0, 0], [1, 0], [1, 1], [0, 1], awn, n);
        const sw = Math.min(e.len * 0.8, 7);
        const mid = [(e.p[0] + e.q[0]) / 2 + e.nx * 0.06, (e.p[1] + e.q[1]) / 2 + e.nz * 0.06];
        const s = Math.floor(h2(6) * SIGNS.length);
        const sy0 = 2.95;
        const sy1 = sy0 + Math.min(0.9, sw / 6);
        const v0 = s / SIGNS.length;
        const v1 = (s + 1) / SIGNS.length;
        signs.quad(
          V(mid[0]! - dx * sw / 2, sy0, mid[1]! - dz * sw / 2), V(mid[0]! + dx * sw / 2, sy0, mid[1]! + dz * sw / 2),
          V(mid[0]! + dx * sw / 2, sy1, mid[1]! + dz * sw / 2), V(mid[0]! - dx * sw / 2, sy1, mid[1]! - dz * sw / 2),
          [0, 1 - v1], [1, 1 - v1], [1, 1 - v0], [0, 1 - v0], col.set(0xffffff), n,
        );
      }
    }

    if (pitched) {
      // Telhado de telha sobre o retângulo orientado, com beiral de 0,4 m.
      const { cx, cz, ux, uz } = box;
      const o = 0.4;
      const a = box.a + o;
      const bb = box.b + o;
      const rise = bb * 0.5;
      const P = (u: number, v: number, y: number) => V(cx + u * ux - v * uz, y, cz + u * uz + v * ux);
      const y = wallH - 0.15;
      const gable = h2(7) < 0.4;
      const ridge = gable ? a : Math.max(0, a - bb);
      const tint = h2(8) < 0.22 ? col.setRGB(0.42, 0.42, 0.4) : col.setRGB(0.78, 0.34, 0.17).offsetHSL((h2(9) - 0.5) * 0.04, 0, (h2(10) - 0.5) * 0.12);
      const tc = tint.clone();
      const uvS = (p: THREE.Vector3) => [(p.x * ux + p.z * uz) / 2, (-p.x * uz + p.z * ux) / 2 + p.y * 0.6];
      const uvE = (p: THREE.Vector3) => [(-p.x * uz + p.z * ux) / 2, (p.x * ux + p.z * uz) / 2 + p.y * 0.6];
      for (const sgn of [1, -1]) {
        const e0 = P(-a, sgn * bb, y);
        const e1 = P(a, sgn * bb, y);
        const r1 = P(ridge, 0, y + rise);
        const r0 = P(-ridge, 0, y + rise);
        tile.quad(e0, e1, r1, r0, uvS(e0), uvS(e1), uvS(r1), uvS(r0), tc, V(-sgn * uz, 1, sgn * ux));
        if (gable) {
          // Oitão: triângulo de parede sob a ponta do telhado.
          const w0 = P(sgn * box.a, -box.b, y);
          const w1 = P(sgn * box.a, box.b, y);
          const w2 = P(sgn * box.a, 0, y + rise * (box.b / bb));
          const cu = (CELL.wall + 0.5) / CELLS;
          walls.tri(w0, w1, w2, [cu, 0.2], [cu, 0.2], [cu, 0.6], facadeColor, V(sgn * ux, 0, sgn * uz));
        } else {
          const t0 = P(sgn * a, -bb, y);
          const t1 = P(sgn * a, bb, y);
          const t2 = P(sgn * ridge, 0, y + rise);
          tile.tri(t0, t1, t2, uvE(t0), uvE(t1), uvE(t2), tc, V(sgn * ux, 1, sgn * uz));
        }
      }
      // Cumeeira.
      const ridgeC = tc.clone().multiplyScalar(0.8);
      trim.quad(P(-ridge - (gable ? 0 : 0.1), -0.12, y + rise + 0.02), P(ridge, -0.12, y + rise + 0.02), P(ridge, 0.12, y + rise + 0.02), P(-ridge, 0.12, y + rise + 0.02), [0, 0], [1, 0], [1, 1], [0, 1], ridgeC, UP);
      if (h2(11) < 0.3) tanks.push({ x: cx + uz * 0.8, y: y + rise * 0.55, z: cz - ux * 0.8, s: 0.8 });
    } else {
      // Laje (ou zinco) um pouco abaixo do topo da parede, formando a platibanda.
      const yr = wallH - (shed ? 0.25 : 0.55);
      const geo = shed ? metal : slab;
      const tc = shed ? col.setRGB(0.75, 0.77, 0.8).clone() : col.setRGB(0.85, 0.84, 0.82).offsetHSL(0, 0, (h2(12) - 0.5) * 0.15).clone();
      const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const sg = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, yr, 0).toNonIndexed();
      const pa = sg.getAttribute("position");
      for (let i = 0; i < pa.count; i += 3) {
        const pts = [0, 1, 2].map((k) => V(pa.getX(i + k), pa.getY(i + k), pa.getZ(i + k)));
        const uvs = pts.map((p) => (shed ? [p.x * box.ux / 1 + p.z * box.uz, -p.x * box.uz + p.z * box.ux].map((v) => v / 3) : [p.x / 4, p.z / 4]));
        geo.tri(pts[0]!, pts[1]!, pts[2]!, uvs[0]!, uvs[1]!, uvs[2]!, tc, UP);
      }
      sg.dispose();
      // Face interna e topo da platibanda.
      const inner = facadeColor.clone().multiplyScalar(0.7);
      const cu = (CELL.wall + 0.5) / CELLS;
      for (const e of edges) {
        if (e.len < 0.05) continue;
        const a0 = V(e.p[0], yr, e.p[1]);
        const b0 = V(e.q[0], yr, e.q[1]);
        trim.quad(a0, b0, V(e.q[0], wallH, e.q[1]), V(e.p[0], wallH, e.p[1]), [cu, 1], [cu, 1], [cu, 0], [cu, 0], inner, V(-e.nx, 0, -e.nz));
        walls.quad(V(e.p[0], wallH, e.p[1]), V(e.q[0], wallH, e.q[1]), V(e.q[0] - e.nx * 0.18, wallH, e.q[1] - e.nz * 0.18), V(e.p[0] - e.nx * 0.18, wallH, e.p[1] - e.nz * 0.18), [cu, 0.1], [cu, 0.1], [cu, 0.1], [cu, 0.1], facadeColor, UP);
      }
      // Caixa d'água azul em cima da laje.
      if (!shed && h2(13) < 0.75) {
        const tx = box.cx + box.ux * box.a * (h2(14) - 0.5);
        const tz = box.cz + box.uz * box.a * (h2(14) - 0.5);
        if (inside(tx, tz, ring)) tanks.push({ x: tx, y: yr, z: tz, s: levels >= 3 ? 1.3 : 1 });
      }
    }
  }

  for (const [g, m] of [[walls, M.wall], [tile, M.tile], [slab, M.slab], [metal, M.metal], [trim, M.trim], [signs, M.sign]] as const) {
    const mesh = g.mesh(m);
    if (mesh) group.add(mesh);
  }
  if (tanks.length) {
    const geo = new THREE.CylinderGeometry(0.55, 0.62, 0.9, 12).translate(0, 0.45, 0);
    const lid = new THREE.ConeGeometry(0.6, 0.25, 12).translate(0, 1.02, 0);
    const im = new THREE.InstancedMesh(geo, M.tank, tanks.length);
    const il = new THREE.InstancedMesh(lid, M.tank, tanks.length);
    const o = new THREE.Object3D();
    tanks.forEach((t, i) => {
      o.position.set(t.x, t.y, t.z);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      il.setMatrixAt(i, o.matrix);
    });
    im.castShadow = il.castShadow = true;
    group.add(im, il);
  }
  return group;
}
