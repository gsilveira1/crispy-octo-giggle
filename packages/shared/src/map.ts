import { z } from "zod";
import { BBox } from "./geo.js";

/**
 * Camadas de uma cidade já convertidas para o jogo.
 * Coordenadas em metros de jogo, origem no canto sudoeste do recorte:
 * x cresce para leste, y cresce para norte. Já aplicam a escala comprimida.
 */
export const Point = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof Point>;
export const Line = z.array(Point).min(2);
export type Line = z.infer<typeof Line>;
/** Polígono: anel externo seguido dos anéis internos (buracos). */
export const Polygon = z.array(z.array(Point).min(4)).min(1);
export type Polygon = z.infer<typeof Polygon>;

export const RoadClass = z.enum([
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "residential", "service", "pedestrian", "path", "track", "other",
]);
export type RoadClass = z.infer<typeof RoadClass>;

const osmRef = { osmId: z.string() };

export const Road = z.object({
  ...osmRef,
  name: z.string().optional(),
  ref: z.string().optional(),
  class: RoadClass,
  oneway: z.boolean().default(false),
  bridge: z.boolean().default(false),
  /** Largura em metros de jogo. */
  width: z.number().positive(),
  line: Line,
});
export type Road = z.infer<typeof Road>;

export const Building = z.object({
  ...osmRef,
  kind: z.string(),
  name: z.string().optional(),
  levels: z.number().int().min(1),
  /** true quando o número de andares veio do OSM e não da regra padrão. */
  levelsFromOsm: z.boolean(),
  polygon: Polygon,
});
export type Building = z.infer<typeof Building>;

export const AreaKind = z.enum(["water", "park", "forest", "grass", "residential", "commercial", "industrial", "farmland", "other"]);
export type AreaKind = z.infer<typeof AreaKind>;

export const Area = z.object({ ...osmRef, kind: AreaKind, name: z.string().optional(), polygon: Polygon });
export type Area = z.infer<typeof Area>;

export const Waterway = z.object({ ...osmRef, kind: z.string(), name: z.string().optional(), line: Line });
export type Waterway = z.infer<typeof Waterway>;

export const Railway = z.object({ ...osmRef, kind: z.string(), line: Line });
export type Railway = z.infer<typeof Railway>;

export const PoiCategory = z.enum(["civic", "religious", "education", "health", "food", "shop", "leisure", "transport", "tourism", "other"]);
export type PoiCategory = z.infer<typeof PoiCategory>;

export const Poi = z.object({
  ...osmRef,
  name: z.string().optional(),
  category: PoiCategory,
  /** Tag original, ex.: "amenity=townhall". */
  tag: z.string(),
  position: Point,
});
export type Poi = z.infer<typeof Poi>;

export const MapNeighbourhood = z.object({ ...osmRef, name: z.string(), polygons: z.array(Polygon) });
export type MapNeighbourhood = z.infer<typeof MapNeighbourhood>;

export const CityMap = z.object({
  cityId: z.string(),
  source: z.object({
    attribution: z.literal("© OpenStreetMap contributors"),
    license: z.literal("ODbL-1.0"),
    osmTimestamp: z.string().optional(),
    /** Recorte em WGS84: [oeste, sul, leste, norte]. */
    bbox: BBox,
    /** EPSG da projeção métrica usada antes da compressão. */
    projection: z.string(),
  }),
  /** Metros de jogo por metro real (0.5 = cidade com metade do tamanho). */
  scale: z.number().positive().max(1),
  size: z.object({ width: z.number(), height: z.number() }),
  roads: z.array(Road),
  buildings: z.array(Building),
  areas: z.array(Area),
  waterways: z.array(Waterway),
  railways: z.array(Railway),
  pois: z.array(Poi),
  neighbourhoods: z.array(MapNeighbourhood),
});
export type CityMap = z.infer<typeof CityMap>;

/**
 * Projeção isométrica 2:1 (afim). Converte metros de jogo em pixels de tela,
 * dado o tamanho em metros do lado de um tile e a largura do tile em pixels.
 */
export function toIso([x, y]: Point, metersPerTile: number, tileWidthPx: number): Point {
  const tx = x / metersPerTile;
  const ty = -y / metersPerTile; // norte para cima no mundo, linha cresce para baixo
  return [((tx - ty) * tileWidthPx) / 2, ((tx + ty) * tileWidthPx) / 4];
}
