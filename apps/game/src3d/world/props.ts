import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Ground } from "@bigriver/shared";
import { isRoad } from "./ground";
import { canvas, canvasTexture, hash, radialTexture } from "./util";

export type Lamp = { x: number; z: number; y: number };
export type Props = { group: THREE.Group; lamps: Lamp[]; blocked: Set<number> };

export const tileKey = (c: number, r: number) => c * 100000 + r;

type Kit = {
  lampPole: THREE.BufferGeometry; lampHead: THREE.BufferGeometry; pool: THREE.BufferGeometry;
  crate: THREE.BufferGeometry; barrel: THREE.BufferGeometry; barrier: THREE.BufferGeometry;
  carBody: THREE.BufferGeometry; carCabin: THREE.BufferGeometry; trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry;
  metal: THREE.Material; headMat: THREE.Material; poolMat: THREE.Material; crateMat: THREE.Material;
  barrelMat: THREE.Material; barrierMat: THREE.Material; carMat: THREE.Material; glassMat: THREE.Material;
  trunkMat: THREE.Material; leafMat: THREE.Material;
};
let kit: Kit | undefined;

function makeKit(): Kit {
  // Poste: haste, braço e luminária; a cabeça fica 1,4 m para o lado da rua (+x local).
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.6, 6).translate(0, 2.3, 0);
  const arm = new THREE.BoxGeometry(1.5, 0.08, 0.08).translate(0.7, 4.5, 0);
  const base = new THREE.CylinderGeometry(0.16, 0.2, 0.4, 6).translate(0, 0.2, 0);
  const lampPole = mergeGeometries([pole, arm, base])!;
  const lampHead = new THREE.BoxGeometry(0.55, 0.16, 0.3).translate(1.4, 4.42, 0);
  const pool = new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2);

  const [wc, wg] = canvas(64, 64);
  wg.fillStyle = "#8a5a32";
  wg.fillRect(0, 0, 64, 64);
  wg.fillStyle = "#6c4325";
  for (let i = 0; i < 64; i += 11) wg.fillRect(0, i, 64, 2);
  wg.strokeStyle = "#5a3820";
  wg.lineWidth = 6;
  wg.strokeRect(3, 3, 58, 58);
  wg.beginPath();
  wg.moveTo(6, 6);
  wg.lineTo(58, 58);
  wg.moveTo(58, 6);
  wg.lineTo(6, 58);
  wg.stroke();
  const [bc, bg] = canvas(64, 64);
  bg.fillStyle = "#2f4a4c";
  bg.fillRect(0, 0, 64, 64);
  bg.fillStyle = "#1e3032";
  bg.fillRect(0, 14, 64, 4);
  bg.fillRect(0, 46, 64, 4);
  bg.fillStyle = "rgba(120,60,30,0.6)";
  for (let i = 0; i < 40; i++) bg.fillRect(hash(i, 1) * 64, hash(i, 2) * 64, 2 + hash(i, 3) * 4, 1 + hash(i, 4) * 6);
  const [sc, sg] = canvas(128, 32);
  sg.fillStyle = "#d9d4c9";
  sg.fillRect(0, 0, 128, 32);
  sg.fillStyle = "#c8551f";
  for (let i = -32; i < 128; i += 32) {
    sg.beginPath();
    sg.moveTo(i, 32);
    sg.lineTo(i + 16, 0);
    sg.lineTo(i + 32, 0);
    sg.lineTo(i + 16, 32);
    sg.fill();
  }

  const jersey = new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.12, 0.85), new THREE.Vector2(-0.12, 0.85)]);
  const barrier = new THREE.ExtrudeGeometry(jersey, { depth: 2, bevelEnabled: false }).translate(0, 0, -1);
  barrier.computeVertexNormals();

  return {
    lampPole, lampHead, pool,
    crate: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    barrel: new THREE.CylinderGeometry(0.33, 0.33, 0.95, 12).translate(0, 0.475, 0),
    barrier,
    carBody: new THREE.BoxGeometry(4.1, 0.75, 1.8).translate(0, 0.62, 0),
    carCabin: new THREE.BoxGeometry(2.1, 0.62, 1.6).translate(-0.25, 1.3, 0),
    trunk: new THREE.CylinderGeometry(0.12, 0.18, 2.2, 6).translate(0, 1.1, 0),
    canopy: mergeGeometries([
      new THREE.IcosahedronGeometry(1.5, 0).translate(0, 3.1, 0),
      new THREE.IcosahedronGeometry(1.1, 0).translate(0.7, 2.6, 0.4),
      new THREE.IcosahedronGeometry(1.0, 0).translate(-0.6, 2.7, -0.5),
    ])!,
    trunkMat: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 }),
    leafMat: new THREE.MeshStandardMaterial({ color: 0x3f5f34, roughness: 0.85, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.7 }),
    headMat: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb060, emissiveIntensity: 3 }),
    poolMat: new THREE.MeshBasicMaterial({ map: radialTexture("rgba(255,170,80,0.22)", "rgba(255,150,60,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    crateMat: new THREE.MeshStandardMaterial({ map: canvasTexture(wc), roughness: 0.9 }),
    barrelMat: new THREE.MeshStandardMaterial({ map: canvasTexture(bc), roughness: 0.6, metalness: 0.4 }),
    barrierMat: new THREE.MeshStandardMaterial({ map: canvasTexture(sc), roughness: 0.8 }),
    carMat: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }),
    glassMat: new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.1, metalness: 0.8 }),
  };
}

type Inst = { x: number; z: number; rot: number; s?: number; color?: THREE.Color };

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], shadow = true): THREE.InstancedMesh | undefined {
  if (!list.length) return undefined;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((p, i) => {
    o.position.set(p.x, 0, p.z);
    o.rotation.set(0, p.rot, 0);
    o.scale.setScalar(p.s ?? 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (p.color) m.setColorAt(i, p.color);
  });
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const CAR_COLORS = ["#6d1f1f", "#2c3e57", "#6b6b66", "#c9c4b8", "#1f3b2a", "#7a5a25", "#262626"];

/**
 * Espalha objetos de forma determinística: postes na calçada junto à rua, carros abandonados,
 * caixas e barris perto dos prédios, barreiras de bloqueio na rua (é depois da Cerração).
 */
export function buildProps(ground: Uint8Array, size: number, ox: number, oy: number, mpt: number): Props {
  kit ??= makeKit();
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= size || r >= size ? undefined : ground[r * size + c]);
  const walkable = (t: number | undefined) => t === Ground.ground || t === Ground.plaza || t === Ground.path;
  const lamps: (Inst & Lamp)[] = [];
  const crates: Inst[] = [];
  const barrels: Inst[] = [];
  const barriers: Inst[] = [];
  const cars: Inst[] = [];
  const trees: Inst[] = [];
  const blocked = new Set<number>();
  const CELL = 7;
  const best = new Map<number, { h: number; c: number; r: number; dir: [number, number] }>();

  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const t = ground[r * size + c];
      const gc = ox + c;
      const gr = oy + r;
      const h = hash(gc, gr, 11);
      const cx = (gc + 0.5) * mpt;
      const cz = (gr + 0.5) * mpt;
      if ((t === Ground.grass && h < 0.07) || (t === Ground.forest && h < 0.4)) {
        // Árvores nas praças e nas matas (copas em tons variados).
        const tone = new THREE.Color().setHSL(0.27 + hash(gc, gr, 21) * 0.06, 0.35, 0.22 + hash(gc, gr, 22) * 0.12);
        trees.push({ x: cx + (hash(gc, gr, 23) - 0.5), z: cz + (hash(gc, gr, 24) - 0.5), rot: h * 60, s: 0.8 + hash(gc, gr, 25) * 0.6, color: tone });
        blocked.add(tileKey(gc, gr));
      } else if (walkable(t)) {
        const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const road = dirs.find(([dc, dr]) => isRoad(at(c + dc, r + dr)));
        if (road) {
          const cell = Math.floor(gc / CELL) * 1000 + Math.floor(gr / CELL);
          const cur = best.get(cell);
          if (!cur || h < cur.h) best.set(cell, { h, c, r, dir: road });
        } else if (dirs.some(([dc, dr]) => at(c + dc, r + dr) === Ground.lot) && h < 0.035) {
          // Pilha de caixas ou barris encostada no prédio.
          const k = hash(gc, gr, 12);
          const list = k < 0.55 ? crates : barrels;
          const n = 1 + Math.floor(hash(gc, gr, 13) * 3);
          for (let i = 0; i < n; i++)
            list.push({ x: cx + (hash(gc, i, 14) - 0.5) * 1.2, z: cz + (hash(gr, i, 15) - 0.5) * 1.2, rot: hash(gc + i, gr, 16) * 6.28, s: 0.75 + hash(i, gc, 17) * 0.35 });
          blocked.add(tileKey(gc, gr));
        }
      } else if (isRoad(t) && h < 0.008) {
        const alongX = isRoad(at(c - 1, r)) && isRoad(at(c + 1, r));
        const alongZ = isRoad(at(c, r - 1)) && isRoad(at(c, r + 1));
        if (alongX || alongZ) {
          const rot = (alongX && !alongZ ? 0 : Math.PI / 2) + (hash(gc, gr, 18) - 0.5) * 0.7;
          const k = hash(gc, gr, 19);
          if (k < 0.75) {
            cars.push({ x: cx, z: cz, rot, color: new THREE.Color(CAR_COLORS[Math.floor(hash(gc, gr, 20) * CAR_COLORS.length)]!) });
            const [dc, dr] = alongX && !alongZ ? [1, 0] : [0, 1];
            blocked.add(tileKey(gc, gr)).add(tileKey(gc + dc, gr + dr)).add(tileKey(gc - dc, gr - dr));
          } else {
            barriers.push({ x: cx, z: cz, rot: rot + Math.PI / 2 });
            blocked.add(tileKey(gc, gr));
          }
        }
      }
    }
  for (const { c, r, dir } of best.values()) {
    const x = (ox + c + 0.5 + dir[0] * 0.35) * mpt;
    const z = (oy + r + 0.5 + dir[1] * 0.35) * mpt;
    const rot = Math.atan2(-dir[1], dir[0]);
    lamps.push({ x, z, y: 4.4, rot });
    blocked.add(tileKey(ox + c, oy + r));
  }

  const k = kit;
  const group = new THREE.Group();
  const lampHeads = lamps.map((l) => ({ ...l }));
  const pools = lamps.map((l) => ({ x: l.x + Math.cos(l.rot) * 1.4, z: l.z - Math.sin(l.rot) * 1.4, rot: 0 }));
  const meshes = [
    instanced(k.lampPole, k.metal, lamps),
    instanced(k.lampHead, k.headMat, lampHeads, false),
    instanced(k.pool, k.poolMat, pools, false),
    instanced(k.crate, k.crateMat, crates),
    instanced(k.barrel, k.barrelMat, barrels),
    instanced(k.barrier, k.barrierMat, barriers),
    instanced(k.carBody, k.carMat, cars),
    instanced(k.carCabin, k.glassMat, cars),
    instanced(k.trunk, k.trunkMat, trees),
    instanced(k.canopy, k.leafMat, trees),
  ];
  for (const m of meshes) if (m) group.add(m);
  const pool = meshes[2];
  if (pool) {
    pool.position.y = 0.03;
    pool.receiveShadow = false;
    pool.renderOrder = 1;
  }
  const lampOut = lamps.map((l) => ({ x: l.x + Math.cos(l.rot) * 1.4, z: l.z - Math.sin(l.rot) * 1.4, y: l.y }));
  return { group, lamps: lampOut, blocked };
}
