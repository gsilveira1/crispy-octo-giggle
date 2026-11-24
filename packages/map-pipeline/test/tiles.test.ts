import { describe, expect, it } from "vitest";
import { decodeGround, Ground, screenToTile, tileToScreen, type CityMap } from "@bigriver/shared";
import { buildTiles } from "../src/tiles.js";

const map: CityMap = {
  cityId: "t",
  source: { attribution: "© OpenStreetMap contributors", extraAttributions: ["Google Open Buildings (ODbL)"], license: "ODbL-1.0", bbox: [0, 0, 1, 1], projection: "EPSG:31982" },
  scale: 0.5,
  size: { width: 200, height: 100 },
  // Rua horizontal no meio (y = 50 m), 8 m de largura.
  roads: [{ osmId: "way/1", name: "Rua A", class: "residential", oneway: false, bridge: false, width: 8, line: [[0, 50], [200, 50]] }],
  // Prédio de 20×20 m no canto nordeste.
  buildings: [{ osmId: "way/2", source: "osm", kind: "house", levels: 1, levelsFromOsm: false, polygon: [[[160, 80], [180, 80], [180, 100], [160, 100], [160, 80]]] }],
  areas: [{ osmId: "way/3", kind: "water", polygon: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] }],
  waterways: [], railways: [],
  pois: [{ osmId: "node/4", name: "Prefeitura", category: "civic", tag: "amenity=townhall", position: [100, 70] }],
  neighbourhoods: [],
};

describe("buildTiles", () => {
  const { manifest, chunks } = buildTiles(map, { name: "T", metersPerTile: 2, chunkSize: 64 });
  const at = (c: number, r: number) => {
    const ch = chunks.find((x) => x.cx === Math.floor(c / 64) && x.cy === Math.floor(r / 64))!;
    return decodeGround(ch.ground)[(r % 64) * 64 + (c % 64)];
  };

  it("divide a grade em chunks", () => {
    expect(manifest).toMatchObject({ cols: 100, rows: 50, chunksX: 2, chunksY: 1 });
    expect(chunks).toHaveLength(2);
  });

  it("pinta rua, água e terreno de prédio nos tiles certos (linha 0 = norte)", () => {
    expect(at(50, 25)).toBe(Ground.road_minor); // y = 50 m → linha 25
    expect(at(50, 10)).toBe(Ground.ground);
    expect(at(2, 47)).toBe(Ground.water); // canto sudoeste
    expect(at(85, 5)).toBe(Ground.lot); // canto nordeste
  });

  it("guarda o contorno do prédio em coordenadas de tile no chunk do centro", () => {
    expect(chunks[1]!.buildings[0]!.footprint[0]).toEqual([80, 10]);
  });

  it("nasce numa rua perto da prefeitura e lista pontos da rua", () => {
    expect(at(Math.floor(manifest.spawn[0]), Math.floor(manifest.spawn[1]))).toBe(Ground.road_minor);
    expect(manifest.streets[0]!.name).toBe("Rua A");
    expect(manifest.streets[0]!.points.length).toBeGreaterThan(20);
    expect(manifest.attribution).toEqual(["© OpenStreetMap contributors", "Google Open Buildings (ODbL)"]);
  });
});

describe("projeção isométrica", () => {
  it("ida e volta", () => {
    expect(tileToScreen([1, 0])).toEqual([32, 16]);
    expect(tileToScreen([0, 1])).toEqual([-32, 16]);
    expect(screenToTile(tileToScreen([12.5, 7.25]))).toEqual([12.5, 7.25]);
  });
});
