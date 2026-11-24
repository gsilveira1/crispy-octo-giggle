import type { CityMap, PoiCategory } from "@bigriver/shared";

export type Coverage = {
  buildings: number;
  buildingsWithLevels: number;
  buildingsBySource: Record<string, number>;
  buildingKinds: Record<string, number>;
  roadSegments: number;
  roadKm: number;
  namedRoadKm: number;
  pois: number;
  namedPois: number;
  poisByCategory: Partial<Record<PoiCategory, number>>;
  neighbourhoods: string[];
  waterways: string[];
};

const len = (line: [number, number][]) =>
  line.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - line[i]![0], p[1] - line[i]![1]), 0);

/** Números para decidir o que dá para usar do OSM e o que precisa de curadoria. */
export function coverage(map: CityMap): Coverage {
  const toKm = (m: number) => Math.round((m / map.scale / 1000) * 10) / 10;
  const kinds: Record<string, number> = {};
  for (const b of map.buildings) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
  const byCat: Partial<Record<PoiCategory, number>> = {};
  for (const p of map.pois) byCat[p.category] = (byCat[p.category] ?? 0) + 1;
  const roadM = map.roads.reduce((s, r) => s + len(r.line), 0);
  const namedM = map.roads.filter((r) => r.name).reduce((s, r) => s + len(r.line), 0);
  return {
    buildings: map.buildings.length,
    buildingsWithLevels: map.buildings.filter((b) => b.levelsFromOsm).length,
    buildingsBySource: map.buildings.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.source]: (acc[b.source] ?? 0) + 1 }), {}),
    buildingKinds: Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1])),
    roadSegments: map.roads.length,
    roadKm: toKm(roadM),
    namedRoadKm: toKm(namedM),
    pois: map.pois.length,
    namedPois: map.pois.filter((p) => p.name).length,
    poisByCategory: byCat,
    neighbourhoods: [...new Set(map.neighbourhoods.map((n) => n.name))].sort(),
    waterways: [...new Set(map.waterways.map((w) => w.name).filter((n): n is string => !!n))].sort(),
  };
}
