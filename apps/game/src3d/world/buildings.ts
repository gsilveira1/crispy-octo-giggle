import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TileBuilding } from "@bigriver/shared";
import { canvas, canvasTexture, hash } from "./util";

/** Altura de um andar em metros. */
export const LEVEL_M = 2.8;
/** Largura de uma "baia" de janela em metros. */
const BAY_M = 2.4;
/** A textura de janelas tem 8×8 baias, com acesas e apagadas misturadas. */
const GRID = 8;

/** Tinta das paredes por tipo OSM (multiplica a textura). */
const WALL: Record<string, string> = {
  default: "#b9ad9a",
  house: "#c4ab8a",
  apartments: "#a9a7a2",
  commercial: "#a49cae",
  retail: "#b89c8e",
  church: "#d8d0bd",
  public: "#c7bb98",
  government: "#c7bb98",
  school: "#c6ad80",
  industrial: "#8f969c",
  warehouse: "#8f969c",
};
const ROOF: Record<string, string> = {
  default: "#9a5f48",
  house: "#a5583f",
  apartments: "#6d6d72",
  commercial: "#66636e",
  church: "#5d6474",
  industrial: "#6e777f",
  warehouse: "#6e777f",
};

let shared: { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial } | undefined;
/** Uniforms do recorte em volta do jogador: posição do jogador e da câmera em metros. */
export const occlusion = { uPlayer: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } };

/**
 * Recorta (com pontilhado) o que estiver entre a câmera e o jogador, para ele nunca sumir atrás
 * de um prédio. Funciona com os prédios fundidos num só mesh por chunk.
 */
function withOcclusionCutout(m: THREE.MeshStandardMaterial) {
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
}

function materials() {
  if (shared) return shared;
  // Janelas: 8×8 baias de 32 px; parede clara (tingida por vértice) e vidro escuro, ~22% acesas.
  const P = 32;
  const [cv, g] = canvas(GRID * P, GRID * P);
  const [ev, e] = canvas(GRID * P, GRID * P);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, GRID * P, GRID * P);
  e.fillStyle = "#000";
  e.fillRect(0, 0, GRID * P, GRID * P);
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const x = i * P;
      const y = j * P;
      // Linha do andar e sujeira escorrendo.
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x, y + P - 3, P, 3);
      g.fillStyle = `rgba(30,25,20,${0.05 + hash(i, j, 9) * 0.12})`;
      g.fillRect(x, y, P, P);
      const lit = hash(i, j, 3) < 0.22;
      g.fillStyle = lit ? "#2a1a0c" : "#1b2129";
      g.fillRect(x + 8, y + 7, P - 16, P - 15);
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fillRect(x + 7, y + P - 9, P - 14, 2);
      if (lit) {
        e.fillStyle = hash(i, j, 4) > 0.5 ? "#ff8a2a" : "#ffb04a";
        e.fillRect(x + 8, y + 7, P - 16, P - 15);
      }
    }
  const map = canvasTexture(cv, true, true);
  const emissiveMap = canvasTexture(ev, true, true);
  const wall = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1, vertexColors: true, roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  withOcclusionCutout(wall);
  withOcclusionCutout(roof);
  shared = { wall, roof };
  return shared;
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

/** Junta todos os prédios de um chunk em dois meshes (paredes e telhados). */
export function buildBuildings(list: TileBuilding[], mpt: number): THREE.Group {
  const group = new THREE.Group();
  if (list.length === 0) return group;
  const { wall, roof } = materials();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();

  for (const b of list) {
    const ring = b.footprint.slice(0, -1).map(([x, z]) => [x * mpt, z * mpt] as [number, number]);
    if (ring.length < 3) continue;
    const seed = hash(Math.round(ring[0]![0] * 10), Math.round(ring[0]![1] * 10), 1);
    const h = b.levels * LEVEL_M + (b.levels === 1 ? 0.6 : 0);
    c.set(WALL[b.kind] ?? WALL.default!).offsetHSL(0, (seed - 0.5) * 0.08, (seed - 0.5) * 0.12).convertSRGBToLinear();
    // Deslocamento aleatório na grade de janelas, para os prédios não acenderem iguais.
    const uo = Math.floor(seed * GRID);
    const vo = Math.floor(hash(uo, 7, 2) * GRID);
    let acc = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      let nx = (bz - az) / len;
      let nz = -(bx - ax) / len;
      if (inside((ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05, ring)) [nx, nz] = [-nx, -nz];
      const u0 = (uo + acc / BAY_M) / GRID;
      const u1 = (uo + (acc + len) / BAY_M) / GRID;
      const v0 = vo / GRID;
      const v1 = (vo + h / LEVEL_M) / GRID;
      acc += len;
      // Dois triângulos com a face para fora (ordem anti-horária vista de fora).
      const quad = [
        [ax, 0, az, u0, v0], [bx, 0, bz, u1, v0], [bx, h, bz, u1, v1],
        [ax, 0, az, u0, v0], [bx, h, bz, u1, v1], [ax, h, az, u0, v1],
      ];
      // Confere a ordem: a normal da face precisa bater com (nx, nz).
      const cross = (bx - ax) * nz - (bz - az) * nx;
      const order = cross > 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
      for (const k of order) {
        const q = quad[k]!;
        pos.push(q[0]!, q[1]!, q[2]!);
        nor.push(nx, 0, nz);
        uv.push(q[3]!, q[4]!);
        col.push(c.r, c.g, c.b);
      }
    }
    // Telhado plano com uma platibanda escura de 0,3 m.
    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    const rg = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, h, 0).toNonIndexed();
    const rc = new THREE.Color(ROOF[b.kind] ?? ROOF.default!).offsetHSL(0, 0, (seed - 0.5) * 0.08).convertSRGBToLinear();
    const n = rg.getAttribute("position").count;
    rg.setAttribute("color", new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [rc.r, rc.g, rc.b]), 3));
    roofs.push(rg);
  }

  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  wg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const walls = new THREE.Mesh(wg, wall);
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);
  if (roofs.length) {
    const merged = mergeGeometries(roofs, false);
    if (merged) {
      const r = new THREE.Mesh(merged, roof);
      r.castShadow = r.receiveShadow = true;
      group.add(r);
    }
    roofs.forEach((g) => g.dispose());
  }
  return group;
}
