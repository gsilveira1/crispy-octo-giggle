import proj4 from "proj4";
import type { BBox, Point } from "@bigriver/shared";
import type { LatLon } from "./overpass.js";

/** SIRGAS 2000 / UTM zona 22S: cobre o RS inteiro com distorção baixa. */
export const EPSG_31982 = "+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

export type Projector = {
  /** WGS84 → metros de jogo (origem no canto SW do recorte, já com escala). */
  project(p: LatLon): Point;
  width: number;
  height: number;
};

export function makeProjector(bbox: BBox, scale: number): Projector {
  const [west, south, east, north] = bbox;
  const utm = proj4("WGS84", EPSG_31982);
  // A origem é o mínimo dos quatro cantos, porque a grade UTM gira em relação ao norte geográfico.
  const corners = [[west, south], [west, north], [east, south], [east, north]].map((c) => utm.forward(c as [number, number]));
  const minX = Math.min(...corners.map((c) => c[0]!));
  const minY = Math.min(...corners.map((c) => c[1]!));
  const maxX = Math.max(...corners.map((c) => c[0]!));
  const maxY = Math.max(...corners.map((c) => c[1]!));
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    project({ lat, lon }) {
      const [x, y] = utm.forward([lon, lat]);
      return [round((x! - minX) * scale), round((y! - minY) * scale)];
    },
    width: round((maxX - minX) * scale),
    height: round((maxY - minY) * scale),
  };
}
