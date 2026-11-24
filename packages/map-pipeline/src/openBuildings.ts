import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import type { BBox } from "@bigriver/shared";
// s2-geometry não tem tipos; usamos só duas funções.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import s2 from "s2-geometry";

const { S2 } = s2 as { S2: { latLngToKey(lat: number, lng: number, level: number): string; keyToId(key: string): string } };

/**
 * Google Open Buildings v3 (https://sites.research.google/gr/open-buildings/).
 * Licença: CC BY 4.0 ou ODbL, à escolha. Usamos ODbL para combinar com o OSM.
 * Os arquivos são divididos por célula S2 de nível 4 (centenas de MB cada).
 */
export const OPEN_BUILDINGS_BASE = "https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip";
export const OPEN_BUILDINGS_ATTRIBUTION = "Google Open Buildings (ODbL)";

export type OpenBuilding = {
  /** Plus code do centro do prédio, estável entre versões. */
  id: string;
  confidence: number;
  areaM2: number;
  /** Anel externo em [lon, lat]. */
  ring: [number, number][];
};

export type OpenBuildingsFile = {
  source: "google-open-buildings-v3";
  license: "ODbL-1.0";
  attribution: typeof OPEN_BUILDINGS_ATTRIBUTION;
  bbox: BBox;
  minConfidence: number;
  fetchedAt: string;
  buildings: OpenBuilding[];
};

/** Tokens S2 nível 4 que cobrem a bbox (os quatro cantos bastam para recortes de cidade). */
export function openBuildingsCells([w, s, e, n]: BBox): string[] {
  const corners: [number, number][] = [[s, w], [s, e], [n, w], [n, e]];
  const tokens = corners.map(([lat, lng]) => BigInt(S2.keyToId(S2.latLngToKey(lat, lng, 4))).toString(16).replace(/0+$/, ""));
  return [...new Set(tokens)];
}

/** Lê um POLYGON WKT "POLYGON((lon lat, ...))" e devolve o anel externo. */
export function parseWktPolygon(wkt: string): [number, number][] | null {
  const m = /^POLYGON\s*\(\((.+?)\)/.exec(wkt.trim());
  if (!m) return null;
  return m[1]!.split(",").map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lon!, lat!] as [number, number];
  });
}

/** Linha do CSV: latitude,longitude,area_in_meters,confidence,"POLYGON((...))",full_plus_code */
export function parseCsvLine(line: string): OpenBuilding & { lat: number; lon: number } | null {
  const q1 = line.indexOf('"');
  const q2 = line.lastIndexOf('"');
  if (q1 < 0 || q2 <= q1) return null;
  const [lat, lon, area, conf] = line.slice(0, q1).split(",").map(Number);
  const plus = line.slice(q2 + 2).trim();
  const ring = parseWktPolygon(line.slice(q1 + 1, q2));
  if (!ring || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { id: plus, lat: lat!, lon: lon!, areaM2: area!, confidence: conf!, ring };
}

/** Baixa as células que cobrem a bbox em streaming e guarda só os prédios dentro dela. */
export async function fetchOpenBuildings(bbox: BBox, minConfidence: number, log = console.log): Promise<OpenBuildingsFile> {
  const [w, s, e, n] = bbox;
  const buildings: OpenBuilding[] = [];
  for (const token of openBuildingsCells(bbox)) {
    const url = `${OPEN_BUILDINGS_BASE}/${token}_buildings.csv.gz`;
    log(`Lendo célula S2 ${token} (arquivo grande, pode levar alguns minutos)...`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} em ${url}`);
    const lines = createInterface({ input: Readable.fromWeb(res.body as never).pipe(createGunzip()), crlfDelay: Infinity });
    let seen = 0;
    for await (const line of lines) {
      if (++seen % 2_000_000 === 0) log(`  ${(seen / 1e6).toFixed(0)} milhões de linhas lidas, ${buildings.length} no recorte`);
      // Filtro barato antes de interpretar a geometria.
      const c1 = line.indexOf(",");
      const lat = Number(line.slice(0, c1));
      if (!(lat >= s && lat <= n)) continue;
      const lon = Number(line.slice(c1 + 1, line.indexOf(",", c1 + 1)));
      if (!(lon >= w && lon <= e)) continue;
      const b = parseCsvLine(line);
      if (!b || b.confidence < minConfidence) continue;
      buildings.push({ id: b.id, confidence: b.confidence, areaM2: b.areaM2, ring: b.ring });
    }
    log(`  célula ${token}: ${seen} linhas, ${buildings.length} prédios no recorte até agora`);
  }
  return {
    source: "google-open-buildings-v3", license: "ODbL-1.0", attribution: OPEN_BUILDINGS_ATTRIBUTION,
    bbox, minConfidence, fetchedAt: new Date().toISOString(), buildings,
  };
}

/** Andares estimados pela área da planta, já que o Open Buildings não traz altura. */
export function levelsFromArea(areaM2: number): number {
  if (areaM2 < 150) return 1;
  if (areaM2 < 600) return 2;
  return 3;
}
