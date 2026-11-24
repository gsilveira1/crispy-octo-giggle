import { XMLParser } from "fast-xml-parser";
import type { LatLon, OsmElement, OverpassResponse, Tags } from "./overpass.js";

type XmlTag = { k: string; v: string };
type XmlNode = { id: string; lat: string; lon: string; tag?: XmlTag[] };
type XmlWay = { id: string; nd?: { ref: string }[]; tag?: XmlTag[] };
type XmlRel = { id: string; member?: { type: string; ref: string; role: string }[]; tag?: XmlTag[] };

const tagsOf = (t?: XmlTag[]): Tags | undefined => (t && t.length ? Object.fromEntries(t.map(({ k, v }) => [k, v])) : undefined);

/**
 * Converte OSM XML (export do openstreetmap.org ou `out body` do Overpass)
 * para o formato JSON com geometria que o conversor usa.
 * Nós ausentes viram `null`, como o Overpass faz fora do bbox.
 */
export function osmXmlToOverpass(xml: string): OverpassResponse {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (name) => ["node", "way", "relation", "tag", "nd", "member"].includes(name),
  });
  const doc = parser.parse(xml).osm ?? {};
  const nodes: XmlNode[] = doc.node ?? [];
  const ways: XmlWay[] = doc.way ?? [];
  const rels: XmlRel[] = doc.relation ?? [];

  const coords = new Map<string, LatLon>();
  for (const n of nodes) coords.set(n.id, { lat: Number(n.lat), lon: Number(n.lon) });
  const wayGeom = new Map<string, (LatLon | null)[]>();
  for (const w of ways) wayGeom.set(w.id, (w.nd ?? []).map((nd) => coords.get(nd.ref) ?? null));

  const elements: OsmElement[] = [];
  for (const n of nodes) {
    const tags = tagsOf(n.tag);
    if (tags) elements.push({ type: "node", id: Number(n.id), lat: Number(n.lat), lon: Number(n.lon), tags });
  }
  for (const w of ways) elements.push({ type: "way", id: Number(w.id), geometry: wayGeom.get(w.id), tags: tagsOf(w.tag) });
  for (const r of rels)
    elements.push({
      type: "relation",
      id: Number(r.id),
      tags: tagsOf(r.tag),
      members: (r.member ?? []).map((m) => ({
        type: m.type as "node" | "way" | "relation",
        ref: Number(m.ref),
        role: m.role ?? "",
        geometry: m.type === "way" ? wayGeom.get(m.ref) : undefined,
      })),
    });
  return { osm3s: { timestamp_osm_base: doc.timestamp }, elements };
}
