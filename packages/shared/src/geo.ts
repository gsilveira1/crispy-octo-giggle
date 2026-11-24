import { z } from "zod";

/** Longitude/latitude in WGS84 (as in OpenStreetMap). */
export const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLat = z.infer<typeof LngLat>;

/** Bounding box: [west, south, east, north] in WGS84. */
export const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type BBox = z.infer<typeof BBox>;
