import * as THREE from "three";
import { BLOCKING_GROUND, decodeGround, Ground, type TileChunk, type TileManifest } from "@bigriver/shared";
import { buildBuildings } from "./buildings";
import { groundMaterial } from "./ground";
import { buildProps, tileKey, type Lamp } from "./props";

type Loaded = { key: string; ground: Uint8Array; group: THREE.Group; lamps: Lamp[]; blocked: Set<number> };

/** Carrega os chunks de 64×64 tiles num raio em volta do jogador e descarrega os que ficam longe. */
export class Chunks3D {
  private loaded = new Map<string, Loaded>();
  private pending = new Map<string, Promise<void>>();
  private plane: THREE.PlaneGeometry;

  constructor(private scene: THREE.Scene, private manifest: TileManifest, private baseUrl: string, private radiusM = 110) {
    const s = manifest.chunkSize * manifest.metersPerTile;
    this.plane = new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2);
  }

  get count() {
    return this.loaded.size;
  }

  get lamps(): Lamp[] {
    return [...this.loaded.values()].flatMap((c) => c.lamps);
  }

  groundAt(c: number, r: number): number | undefined {
    const { chunkSize: s, cols, rows } = this.manifest;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return undefined;
    const ch = this.loaded.get(`${Math.floor(c / s)}_${Math.floor(r / s)}`);
    return ch?.ground[(r % s) * s + (c % s)];
  }

  /** Bloqueado em metros: fora do mapa, chunk não carregado, prédio, água ou objeto. */
  isBlocked = (x: number, z: number): boolean => {
    const m = this.manifest.metersPerTile;
    const c = Math.floor(x / m);
    const r = Math.floor(z / m);
    const g = this.groundAt(c, r);
    if (g === undefined || g === Ground.lot || BLOCKING_GROUND.includes(g)) return true;
    const s = this.manifest.chunkSize;
    return !!this.loaded.get(`${Math.floor(c / s)}_${Math.floor(r / s)}`)?.blocked.has(tileKey(c, r));
  };

  update(x: number, z: number) {
    const span = this.manifest.chunkSize * this.manifest.metersPerTile;
    const { chunksX, chunksY } = this.manifest;
    const wanted = new Set<string>();
    const x0 = Math.max(0, Math.floor((x - this.radiusM) / span));
    const x1 = Math.min(chunksX - 1, Math.floor((x + this.radiusM) / span));
    const z0 = Math.max(0, Math.floor((z - this.radiusM) / span));
    const z1 = Math.min(chunksY - 1, Math.floor((z + this.radiusM) / span));
    for (let cy = z0; cy <= z1; cy++) for (let cx = x0; cx <= x1; cx++) wanted.add(`${cx}_${cy}`);
    for (const key of wanted) if (!this.loaded.has(key) && !this.pending.has(key)) void this.load(key);
    for (const [key, ch] of this.loaded) if (!wanted.has(key)) this.unload(ch);
    return wanted;
  }

  async preload(x: number, z: number) {
    await Promise.all([...this.update(x, z)].map((k) => this.load(k)));
  }

  private load(key: string): Promise<void> {
    if (this.loaded.has(key)) return Promise.resolve();
    const running = this.pending.get(key);
    if (running) return running;
    const p = (async () => {
      try {
        const data = (await (await fetch(`${this.baseUrl}/chunks/${key}.json`)).json()) as TileChunk;
        this.build(key, data);
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, p);
    return p;
  }

  private build(key: string, data: TileChunk) {
    const { chunkSize: s, metersPerTile: m } = this.manifest;
    const ground = decodeGround(data.ground);
    const ox = data.cx * s;
    const oy = data.cy * s;
    const group = new THREE.Group();
    const floor = new THREE.Mesh(this.plane, groundMaterial(ground, s, [ox, oy], this.manifest.streets));
    floor.position.set((ox + s / 2) * m, 0, (oy + s / 2) * m);
    floor.receiveShadow = true;
    group.add(floor, buildBuildings(data.buildings, m));
    const props = buildProps(ground, s, ox, oy, m);
    group.add(props.group);
    this.scene.add(group);
    this.loaded.set(key, { key, ground, group, lamps: props.lamps, blocked: props.blocked });
  }

  private unload(ch: Loaded) {
    this.scene.remove(ch.group);
    ch.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== this.plane && !(o instanceof THREE.InstancedMesh)) o.geometry.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    const floor = ch.group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    floor.material.map?.dispose();
    floor.material.roughnessMap?.dispose();
    floor.material.dispose();
    this.loaded.delete(ch.key);
  }
}
