import * as THREE from "three";
import { BLOCKING_GROUND, decodeGround, Ground, type TileChunk, type TileManifest } from "@bigriver/shared";
import { buildBuildings, roofHeights } from "./buildings";
import { groundMaterial, isRoad } from "./ground";
import { buildProps, tileKey, type Lamp } from "./props";

const cache = new Map<string, Promise<TileChunk>>();
/** Baixa um chunk uma vez só; o minimapa e o mundo 3D usam a mesma cópia. */
export function fetchChunk(baseUrl: string, key: string): Promise<TileChunk> {
  const url = `${baseUrl}/chunks/${key}.json`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<TileChunk>;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

type Loaded = { key: string; ground: Uint8Array; group: THREE.Group; lamps: Lamp[]; blocked: Set<number>; heights: Map<number, number>; roofs: Map<number, number> };

/** Carrega os chunks de 64×64 tiles num raio em volta do jogador e descarrega os que ficam longe. */
export class Chunks3D {
  private loaded = new Map<string, Loaded>();
  private pending = new Map<string, Promise<void>>();
  private plane: THREE.PlaneGeometry;

  /** Altura das lajes por tile, de todos os chunks montados (um prédio pode passar da borda do chunk). */
  private roofs = new Map<number, number>();
  /** Raio carregado em volta do ponto seguido; cresce quando a câmera se afasta. */
  radiusM = 110;
  /** Tiles bloqueados por objetos do builder de cenário (tileKey). */
  readonly extraBlocked = new Set<number>();

  constructor(private scene: THREE.Scene, private manifest: TileManifest, private baseUrl: string) {
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
    if (this.extraBlocked.has(tileKey(c, r))) return true;
    const s = this.manifest.chunkSize;
    return !!this.loaded.get(`${Math.floor(c / s)}_${Math.floor(r / s)}`)?.blocked.has(tileKey(c, r));
  };

  /** Chunks já baixados esperando para virar malha (no máximo alguns por quadro, para não travar). */
  private ready = new Map<string, TileChunk>();

  /**
   * Altura do chão onde dá para pisar, em metros: 0 na rua, o topo de carros, caixas e barreiras,
   * a laje dos prédios de telhado plano. Infinity onde não dá para ficar (parede, árvore, poste,
   * água, fora do mapa, chunk não carregado).
   */
  heightAt = (x: number, z: number): number => {
    const m = this.manifest.metersPerTile;
    const c = Math.floor(x / m);
    const r = Math.floor(z / m);
    const g = this.groundAt(c, r);
    if (g === undefined || BLOCKING_GROUND.includes(g)) return Infinity;
    const s = this.manifest.chunkSize;
    const ch = this.loaded.get(`${Math.floor(c / s)}_${Math.floor(r / s)}`);
    if (!ch) return Infinity;
    const k = tileKey(c, r);
    const prop = ch.heights.get(k);
    if (prop !== undefined) return prop;
    if (g === Ground.lot) return this.roofs.get(k) ?? Infinity;
    return 0;
  };

  update(x: number, z: number, buildsPerFrame = 2) {
    const span = this.manifest.chunkSize * this.manifest.metersPerTile;
    const wanted = this.around(x, z, this.radiusM);
    // Só descarrega bem depois de sair do raio, para não reconstruir ao mexer no zoom.
    const keep = this.around(x, z, this.radiusM * 1.25 + span);
    for (const key of wanted) if (!this.loaded.has(key) && !this.pending.has(key) && !this.ready.has(key)) void this.load(key);
    for (const [key, ch] of this.loaded) if (!keep.has(key)) this.unload(ch);
    for (const key of this.ready.keys()) if (!keep.has(key)) this.ready.delete(key);
    // Constrói primeiro os mais próximos.
    const queue = [...this.ready.entries()].sort(
      ([, a], [, b]) => Math.hypot((a.cx + 0.5) * span - x, (a.cy + 0.5) * span - z) - Math.hypot((b.cx + 0.5) * span - x, (b.cy + 0.5) * span - z),
    );
    for (const [key, data] of queue.slice(0, buildsPerFrame)) {
      this.ready.delete(key);
      this.build(key, data);
    }
    return wanted;
  }

  /** Chunks que ainda faltam montar no raio atual. */
  get missing() {
    return this.ready.size + this.pending.size;
  }

  private around(x: number, z: number, radius: number) {
    const span = this.manifest.chunkSize * this.manifest.metersPerTile;
    const { chunksX, chunksY } = this.manifest;
    const out = new Set<string>();
    const x0 = Math.max(0, Math.floor((x - radius) / span));
    const x1 = Math.min(chunksX - 1, Math.floor((x + radius) / span));
    const z0 = Math.max(0, Math.floor((z - radius) / span));
    const z1 = Math.min(chunksY - 1, Math.floor((z + radius) / span));
    for (let cy = z0; cy <= z1; cy++) for (let cx = x0; cx <= x1; cx++) out.add(`${cx}_${cy}`);
    return out;
  }

  async preload(x: number, z: number) {
    const keys = [...this.around(x, z, this.radiusM)];
    await Promise.all(keys.map((k) => this.load(k)));
    for (const k of keys) {
      const data = this.ready.get(k);
      if (data) {
        this.ready.delete(k);
        this.build(k, data);
      }
    }
  }

  private load(key: string): Promise<void> {
    if (this.loaded.has(key) || this.ready.has(key)) return Promise.resolve();
    const running = this.pending.get(key);
    if (running) return running;
    const p = (async () => {
      try {
        const data = await fetchChunk(this.baseUrl, key);
        if (!this.loaded.has(key)) this.ready.set(key, data);
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
    const local = (c: number, r: number) => (c >= ox && r >= oy && c < ox + s && r < oy + s ? ground[(r - oy) * s + (c - ox)] : this.groundAt(c, r));
    // Distância (m) até o asfalto mais próximo, procurando até 3 tiles em volta.
    const roadDistance = (x: number, z: number) => {
      const c0 = Math.floor(x / m);
      const r0 = Math.floor(z / m);
      let best = Infinity;
      for (let dr = -3; dr <= 3; dr++)
        for (let dc = -3; dc <= 3; dc++)
          if (isRoad(local(c0 + dc, r0 + dr))) best = Math.min(best, Math.hypot((c0 + dc + 0.5) * m - x, (r0 + dr + 0.5) * m - z));
      return best;
    };
    group.add(floor, buildBuildings(data.buildings, m, roadDistance));
    const props = buildProps(ground, s, ox, oy, m);
    group.add(props.group);
    this.scene.add(group);
    const roofs = roofHeights(data.buildings, m, tileKey);
    for (const [k, h] of roofs) this.roofs.set(k, Math.max(this.roofs.get(k) ?? 0, h));
    this.loaded.set(key, { key, ground, group, lamps: props.lamps, blocked: props.blocked, heights: props.heights, roofs });
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
    for (const k of ch.roofs.keys()) this.roofs.delete(k);
    this.loaded.delete(ch.key);
  }
}
