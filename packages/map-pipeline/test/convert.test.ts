import { describe, expect, it } from "vitest";
import { CityMap, toIso } from "@bigriver/shared";
import { convert } from "../src/convert.js";
import { coverage } from "../src/coverage.js";
import { assembleRings } from "../src/rings.js";
import type { OverpassResponse } from "../src/overpass.js";

const bbox: [number, number, number, number] = [-50.79, -29.66, -50.77, -29.64];
const sq = (lat: number, lon: number, d = 0.0002) => [
  { lat, lon }, { lat, lon: lon + d }, { lat: lat + d, lon: lon + d }, { lat: lat + d, lon }, { lat, lon },
];

const data: OverpassResponse = {
  osm3s: { timestamp_osm_base: "2026-11-24T00:00:00Z" },
  elements: [
    { type: "node", id: 1, lat: -29.65, lon: -50.78, tags: { amenity: "townhall", name: "Prefeitura" } },
    { type: "node", id: 2, lat: -29.651, lon: -50.781 },
    {
      type: "way", id: 10, tags: { highway: "primary", name: "Rua Principal", oneway: "yes" },
      geometry: [{ lat: -29.65, lon: -50.789 }, { lat: -29.65, lon: -50.771 }],
    },
    {
      type: "way", id: 11, tags: { highway: "residential" },
      geometry: [{ lat: -29.645, lon: -50.785 }, { lat: -29.646, lon: -50.785 }, null, { lat: -29.648, lon: -50.785 }, { lat: -29.649, lon: -50.785 }],
    },
    { type: "way", id: 12, tags: { highway: "construction" }, geometry: [{ lat: -29.65, lon: -50.78 }, { lat: -29.651, lon: -50.78 }] },
    { type: "way", id: 20, tags: { building: "apartments", "building:levels": "7" }, geometry: sq(-29.652, -50.782) },
    { type: "way", id: 21, tags: { building: "church", amenity: "place_of_worship", name: "Matriz" }, geometry: sq(-29.653, -50.783) },
    { type: "way", id: 22, tags: { building: "yes" }, geometry: sq(-29.654, -50.784) },
    { type: "way", id: 30, tags: { leisure: "park", name: "Praça" }, geometry: sq(-29.655, -50.786, 0.001) },
    { type: "way", id: 40, tags: { waterway: "river", name: "Rio dos Sinos" }, geometry: [{ lat: -29.659, lon: -50.789 }, { lat: -29.658, lon: -50.771 }] },
    {
      type: "relation", id: 100, tags: { boundary: "administrative", admin_level: "10", name: "Centro", type: "boundary" },
      members: [
        { type: "way", ref: 101, role: "outer", geometry: [{ lat: -29.66, lon: -50.79 }, { lat: -29.66, lon: -50.77 }, { lat: -29.64, lon: -50.77 }] },
        { type: "way", ref: 102, role: "outer", geometry: [{ lat: -29.66, lon: -50.79 }, { lat: -29.64, lon: -50.79 }, { lat: -29.64, lon: -50.77 }] },
      ],
    },
  ],
};

describe("convert", () => {
  const map = convert(data, { cityId: "taquara", bbox, scale: 0.5 });

  it("gera um CityMap válido com atribuição ODbL", () => {
    expect(() => CityMap.parse(map)).not.toThrow();
    expect(map.source.attribution).toBe("© OpenStreetMap contributors");
  });

  it("aplica a escala ao tamanho do recorte (~1,9 km × 2,2 km reais)", () => {
    expect(map.size.width).toBeGreaterThan(900);
    expect(map.size.width).toBeLessThan(1050);
    expect(map.size.height).toBeGreaterThan(1050);
    expect(map.size.height).toBeLessThan(1170);
  });

  it("classifica ruas, ignora obras e quebra ways cortadas", () => {
    expect(map.roads.map((r) => r.osmId)).toEqual(["way/10", "way/11", "way/11"]);
    const main = map.roads[0]!;
    expect(main).toMatchObject({ class: "primary", oneway: true, name: "Rua Principal", width: 5 });
    // ~1,74 km reais de leste a oeste viram ~870 m de jogo
    expect(main.line[1]![0] - main.line[0]![0]).toBeGreaterThan(850);
    expect(main.line[1]![0] - main.line[0]![0]).toBeLessThan(890);
  });

  it("usa andares do OSM quando existem e a regra padrão quando não", () => {
    const byId = Object.fromEntries(map.buildings.map((b) => [b.osmId, b]));
    expect(byId["way/20"]).toMatchObject({ levels: 7, levelsFromOsm: true });
    expect(byId["way/21"]).toMatchObject({ levels: 2, levelsFromOsm: false });
    expect(byId["way/22"]).toMatchObject({ levels: 1, levelsFromOsm: false });
  });

  it("extrai POIs de nós, prédios e áreas, e ignora nós sem tags", () => {
    expect(map.pois.map((p) => [p.name, p.category])).toEqual([
      ["Prefeitura", "civic"],
      ["Matriz", "religious"],
      ["Praça", "leisure"],
    ]);
  });

  it("monta bairros a partir dos membros da relação", () => {
    expect(map.neighbourhoods).toHaveLength(1);
    expect(map.neighbourhoods[0]!.polygons[0]![0]!.length).toBe(5);
  });

  it("resume a cobertura", () => {
    const c = coverage(map);
    expect(c).toMatchObject({ buildings: 3, buildingsWithLevels: 1, pois: 3, neighbourhoods: ["Centro"], waterways: ["Rio dos Sinos"] });
    expect(map.areas).toEqual([expect.objectContaining({ kind: "park", name: "Praça" })]);
  });
});

describe("assembleRings", () => {
  it("descarta segmentos que não fecham", () => {
    expect(assembleRings([[{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }]])).toEqual([]);
  });
});

describe("toIso", () => {
  it("projeta leste para baixo-direita e norte para cima-direita", () => {
    expect(toIso([2, 0], 2, 32)).toEqual([16, 8]);
    expect(toIso([0, 2], 2, 32)).toEqual([16, -8]);
  });
});
