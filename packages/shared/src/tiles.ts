import { z } from "zod";
import { Point } from "./map.js";

/**
 * Tipos de chão do mapa isométrico. O índice é o valor guardado na grade
 * e também o frame no tileset (apps/game/public/assets/ground.png).
 */
export const GROUND_TYPES = [
  "ground", // 0 terreno urbano / calçada
  "grass", // 1 praça, gramado
  "forest", // 2 mata
  "water", // 3 rio, lago
  "road_major", // 4 avenidas e rodovias
  "road_minor", // 5 ruas
  "path", // 6 calçadão, trilha
  "rail", // 7 trilho
  "plaza", // 8 área de pedestres
  "farmland", // 9 lavoura
  "lot", // 10 terreno sob prédio
] as const;
export type GroundType = (typeof GROUND_TYPES)[number];
export const Ground = Object.fromEntries(GROUND_TYPES.map((g, i) => [g, i])) as Record<GroundType, number>;

/** Chão que bloqueia o personagem. */
export const BLOCKING_GROUND: readonly number[] = [Ground.water];

export const TileBuilding = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string().optional(),
  levels: z.number().int().min(1),
  source: z.enum(["osm", "open-buildings"]),
  /** Contorno em coordenadas de tile (coluna, linha), anel fechado. */
  footprint: z.array(Point).min(4),
});
export type TileBuilding = z.infer<typeof TileBuilding>;

export const TilePoi = z.object({
  id: z.string(),
  name: z.string().optional(),
  category: z.string(),
  tile: Point,
});
export type TilePoi = z.infer<typeof TilePoi>;

export const TileChunk = z.object({
  cx: z.number().int(),
  cy: z.number().int(),
  /** chunkSize² bytes em base64, linha a linha; valor = índice de GROUND_TYPES. */
  ground: z.string(),
  buildings: z.array(TileBuilding),
});
export type TileChunk = z.infer<typeof TileChunk>;

export const TileManifest = z.object({
  cityId: z.string(),
  name: z.string(),
  version: z.literal(1),
  cols: z.number().int(),
  rows: z.number().int(),
  chunkSize: z.number().int(),
  chunksX: z.number().int(),
  chunksY: z.number().int(),
  /** Metros de jogo por tile. */
  metersPerTile: z.number(),
  /** Tile de nascimento do jogador (coluna, linha). */
  spawn: Point,
  pois: z.array(TilePoi),
  /** Ruas com nome: posição do rótulo e pontos ao longo do traçado (para saber em que rua o jogador está). */
  streets: z.array(z.object({ name: z.string(), tile: Point, points: z.array(Point) })),
  attribution: z.array(z.string()),
});
export type TileManifest = z.infer<typeof TileManifest>;

/** Tamanho em pixels do losango de um tile no cliente. */
export const TILE_W = 64;
export const TILE_H = 32;
/** Altura em pixels de um andar. */
export const LEVEL_PX = 24;

/**
 * Coordenadas contínuas de tile (coluna, linha) → pixels do mundo isométrico.
 * Coluna cresce para leste, linha para sul. O canto (c, r) de um tile é o vértice de cima do losango;
 * o centro do tile fica em (c + 0.5, r + 0.5).
 */
export function tileToScreen([c, r]: Point): Point {
  return [((c - r) * TILE_W) / 2, ((c + r) * TILE_H) / 2];
}

export function screenToTile([x, y]: Point): Point {
  return [y / TILE_H + x / TILE_W, y / TILE_H - x / TILE_W];
}

export function encodeGround(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeGround(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
