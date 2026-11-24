import { describe, expect, it } from "vitest";
import { osmXmlToOverpass } from "../src/osmxml.js";
import { convert } from "../src/convert.js";

const xml = `<?xml version="1.0"?>
<osm version="0.6" timestamp="2026-11-24T00:00:00Z">
  <node id="1" lat="-29.65" lon="-50.789"/>
  <node id="2" lat="-29.65" lon="-50.771"/>
  <node id="3" lat="-29.651" lon="-50.78"><tag k="amenity" v="townhall"/><tag k="name" v="Prefeitura"/></node>
  <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/><tag k="name" v="Rua A"/></way>
  <way id="11"><nd ref="1"/><nd ref="99"/><nd ref="2"/><tag k="highway" v="service"/></way>
</osm>`;

describe("osmXmlToOverpass", () => {
  const data = osmXmlToOverpass(xml);

  it("mantém só nós com tags e monta a geometria das ways", () => {
    expect(data.elements.filter((e) => e.type === "node")).toHaveLength(1);
    const way = data.elements.find((e) => e.type === "way" && e.id === 10);
    expect(way).toMatchObject({ geometry: [{ lat: -29.65, lon: -50.789 }, { lat: -29.65, lon: -50.771 }] });
  });

  it("marca nós ausentes como null e o conversor descarta o pedaço curto", () => {
    const map = convert(data, { cityId: "t", bbox: [-50.79, -29.66, -50.77, -29.64], scale: 0.5 });
    expect(map.roads.map((r) => r.name ?? r.class)).toEqual(["Rua A"]);
    expect(map.pois[0]).toMatchObject({ name: "Prefeitura", category: "civic" });
    expect(map.source.osmTimestamp).toBe("2026-11-24T00:00:00Z");
  });
});
