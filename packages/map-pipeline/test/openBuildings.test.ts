import { describe, expect, it } from "vitest";
import { convert } from "../src/convert.js";
import { levelsFromArea, openBuildingsCells, parseCsvLine, type OpenBuildingsFile } from "../src/openBuildings.js";
import type { OverpassResponse } from "../src/overpass.js";

const bbox: [number, number, number, number] = [-50.79, -29.66, -50.77, -29.64];
const sq = (lat: number, lon: number, d = 0.0002) => [
  { lat, lon }, { lat, lon: lon + d }, { lat: lat + d, lon: lon + d }, { lat: lat + d, lon }, { lat, lon },
];
const ring = (lat: number, lon: number, d = 0.0002): [number, number][] => sq(lat, lon, d).map((p) => [p.lon, p.lat]);

describe("Open Buildings", () => {
  it("acha a célula S2 de Taquara", () => {
    expect(openBuildingsCells(bbox)).toEqual(["951"]);
  });

  it("lê uma linha do CSV", () => {
    const line = '-29.6500,-50.7800,120.5,0.8123,"POLYGON((-50.78 -29.65, -50.7799 -29.65, -50.7799 -29.6499, -50.78 -29.65))",58CXJFJC+2X';
    expect(parseCsvLine(line)).toMatchObject({ id: "58CXJFJC+2X", lat: -29.65, lon: -50.78, areaM2: 120.5, confidence: 0.8123 });
    expect(parseCsvLine(line)!.ring).toHaveLength(4);
  });

  it("estima andares pela área", () => {
    expect([levelsFromArea(80), levelsFromArea(300), levelsFromArea(2000)]).toEqual([1, 2, 3]);
  });

  it("preenche só onde o OSM não tem prédio", () => {
    const osm: OverpassResponse = {
      elements: [{ type: "way", id: 1, tags: { building: "church", name: "Matriz" }, geometry: sq(-29.65, -50.78, 0.0004) }],
    };
    const ob: OpenBuildingsFile = {
      source: "google-open-buildings-v3", license: "ODbL-1.0", attribution: "Google Open Buildings (ODbL)",
      bbox, minConfidence: 0.75, fetchedAt: "2026-11-24T00:00:00Z",
      buildings: [
        { id: "DENTRO", confidence: 0.9, areaM2: 400, ring: ring(-29.6499, -50.7799) }, // sobreposto à igreja
        { id: "FORA", confidence: 0.9, areaM2: 100, ring: ring(-29.655, -50.785) },
      ],
    };
    const map = convert(osm, { cityId: "t", bbox, scale: 0.5, openBuildings: ob });
    expect(map.buildings.map((b) => [b.osmId, b.source, b.levels])).toEqual([
      ["way/1", "osm", 2],
      ["ob/FORA", "open-buildings", 1],
    ]);
    expect(map.source.extraAttributions).toEqual(["Google Open Buildings (ODbL)"]);
  });
});
