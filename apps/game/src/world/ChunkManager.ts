import Phaser from "phaser";
import { BLOCKING_GROUND, decodeGround, Ground, screenToTile, TILE_H, TILE_W, tileToScreen, type TileChunk, type TileManifest } from "@bigriver/shared";
import type { AssetsManifest } from "./assets";
import { drawBuilding, type BuildingView } from "./buildings";

type LoadedChunk = { key: string; ground: Uint8Array; blitter: Phaser.GameObjects.Blitter; buildings: BuildingView[] };

/**
 * Carrega e descarrega chunks em volta da câmera. O chão de cada chunk é um Blitter
 * (um sprite por tile, todos do mesmo tileset); os prédios são Graphics com profundidade.
 */
export class ChunkManager {
  private loaded = new Map<string, LoadedChunk>();
  private pending = new Set<string>();

  constructor(
    private scene: Phaser.Scene,
    private manifest: TileManifest,
    private baseUrl: string,
    private assets: AssetsManifest,
    /** Chunks de folga além da área visível. */
    private margin = 1,
  ) {}

  get buildings(): BuildingView[] {
    return [...this.loaded.values()].flatMap((c) => c.buildings);
  }

  get loadedCount() {
    return this.loaded.size;
  }

  /** Valor do chão no tile (coluna, linha), ou undefined se o chunk não estiver carregado. */
  groundAt(c: number, r: number): number | undefined {
    const { chunkSize: s, cols, rows } = this.manifest;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return undefined;
    const ch = this.loaded.get(`${Math.floor(c / s)}_${Math.floor(r / s)}`);
    return ch?.ground[(r % s) * s + (c % s)];
  }

  isBlocked(c: number, r: number): boolean {
    const g = this.groundAt(Math.floor(c), Math.floor(r));
    return g === undefined || g === Ground.lot || BLOCKING_GROUND.includes(g);
  }

  update(view: Phaser.Geom.Rectangle) {
    const { chunkSize: s, chunksX, chunksY } = this.manifest;
    const corners = [
      screenToTile([view.left, view.top]), screenToTile([view.right, view.top]),
      screenToTile([view.left, view.bottom]), screenToTile([view.right, view.bottom]),
    ];
    // Prédios altos aparecem acima do chão: estende um pouco para baixo na tela.
    const cs = corners.map((p) => p[0]);
    const rs = corners.map((p) => p[1]);
    const cx0 = Math.max(0, Math.floor(Math.min(...cs) / s) - this.margin);
    const cx1 = Math.min(chunksX - 1, Math.floor(Math.max(...cs) / s) + this.margin);
    const cy0 = Math.max(0, Math.floor(Math.min(...rs) / s) - this.margin);
    const cy1 = Math.min(chunksY - 1, Math.floor(Math.max(...rs) / s) + this.margin);
    const wanted = new Set<string>();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) wanted.add(`${cx}_${cy}`);
    for (const key of wanted) if (!this.loaded.has(key) && !this.pending.has(key)) void this.load(key);
    for (const [key, ch] of this.loaded) if (!wanted.has(key)) this.unload(ch);
  }

  /** Espera os chunks em volta de um tile (para o nascimento do jogador). */
  async preload(c: number, r: number) {
    const s = this.manifest.chunkSize;
    const keys: string[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor(c / s) + dx;
        const cy = Math.floor(r / s) + dy;
        if (cx >= 0 && cy >= 0 && cx < this.manifest.chunksX && cy < this.manifest.chunksY) keys.push(`${cx}_${cy}`);
      }
    await Promise.all(keys.map((k) => this.load(k)));
  }

  private async load(key: string) {
    if (this.loaded.has(key) || this.pending.has(key)) return;
    this.pending.add(key);
    try {
      const res = await fetch(`${this.baseUrl}/chunks/${key}.json`);
      const data = (await res.json()) as TileChunk;
      if (!this.pending.has(key)) return; // descarregado enquanto baixava
      this.build(key, data);
    } finally {
      this.pending.delete(key);
    }
  }

  private build(key: string, data: TileChunk) {
    const s = this.manifest.chunkSize;
    const ground = decodeGround(data.ground);
    const [ox, oy] = tileToScreen([data.cx * s, data.cy * s]);
    const blitter = this.scene.add.blitter(ox, oy, "ground").setDepth(-1e9);
    for (let r = 0; r < s; r++)
      for (let c = 0; c < s; c++) {
        if (data.cx * s + c >= this.manifest.cols || data.cy * s + r >= this.manifest.rows) continue;
        // Canto superior esquerdo do frame: o losango do tile (c, r) tem o topo em tileToScreen([c, r]).
        const [x, y] = tileToScreen([c, r]);
        blitter.create(x - TILE_W / 2, y, ground[r * s + c]!);
      }
    const buildings = data.buildings.map((b) => drawBuilding(this.scene, b, this.assets.buildings));
    this.loaded.set(key, { key, ground, blitter, buildings });
    void TILE_H;
  }

  private unload(ch: LoadedChunk) {
    ch.blitter.destroy();
    for (const b of ch.buildings) b.gfx.destroy();
    this.loaded.delete(ch.key);
  }
}
