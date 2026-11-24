import { z } from "zod";
import { BBox, LngLat } from "./geo.js";

export const Neighbourhood = z.object({
  id: z.string(),
  name: z.string(),
  /** OSM relation/way id the shape came from, if any. */
  osmId: z.string().optional(),
  levelRange: z.tuple([z.number().int(), z.number().int()]).optional(),
});
export type Neighbourhood = z.infer<typeof Neighbourhood>;

export const City = z.object({
  id: z.string(),
  name: z.string(),
  state: z.literal("RS"),
  /** IBGE municipality code, e.g. 4321204 for Taquara. */
  ibgeCode: z.string().optional(),
  bbox: BBox,
  spawnPoint: LngLat,
  neighbourhoods: z.array(Neighbourhood).default([]),
  published: z.boolean().default(false),
});
export type City = z.infer<typeof City>;
