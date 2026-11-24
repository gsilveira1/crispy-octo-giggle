import { describe, expect, it } from "vitest";
import { CityConfig, parseBbox } from "../src/cityConfig.js";
import { overpassQuery, overpassTurboUrl } from "../src/query.js";

describe("city config", () => {
  it("valida o id e aplica padrões", () => {
    const cfg = CityConfig.parse({ id: "santa-cruz", name: "Santa Cruz", downloadBbox: [-1, -2, 1, 2], playBbox: [-1, -2, 1, 2] });
    expect(cfg).toMatchObject({ state: "RS", scale: 0.5, metersPerTile: 2 });
    expect(() => CityConfig.parse({ ...cfg, id: "Santa Cruz" })).toThrow();
  });

  it("lê bbox e recusa ordem invertida", () => {
    expect(parseBbox("-50.83,-29.69,-50.73,-29.61", "--bbox")).toEqual([-50.83, -29.69, -50.73, -29.61]);
    expect(() => parseBbox("-50.73,-29.69,-50.83,-29.61", "--bbox")).toThrow();
    expect(() => parseBbox("1,2,3", "--bbox")).toThrow();
  });
});

describe("query", () => {
  it("usa a ordem sul,oeste,norte,leste do Overpass", () => {
    expect(overpassQuery([-50.83, -29.69, -50.73, -29.61])).toContain("[bbox:-29.69,-50.83,-29.61,-50.73]");
  });

  it("gera link do Overpass Turbo que executa a consulta", () => {
    const url = overpassTurboUrl("node(1);out;");
    expect(url.startsWith("https://overpass-turbo.eu/?Q=")).toBe(true);
    expect(url.endsWith("&R")).toBe(true);
  });
});
