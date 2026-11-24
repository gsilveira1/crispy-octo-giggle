/** Formato de resposta do Overpass com `out body geom`. */
export type LatLon = { lat: number; lon: number };
export type Tags = Record<string, string>;

export type OsmNode = { type: "node"; id: number; lat: number; lon: number; tags?: Tags };
export type OsmWay = { type: "way"; id: number; nodes?: number[]; geometry?: (LatLon | null)[]; tags?: Tags };
export type OsmMember = { type: "node" | "way" | "relation"; ref: number; role: string; geometry?: (LatLon | null)[]; lat?: number; lon?: number };
export type OsmRelation = { type: "relation"; id: number; members?: OsmMember[]; tags?: Tags };
export type OsmElement = OsmNode | OsmWay | OsmRelation;

export type OverpassResponse = {
  version?: number;
  osm3s?: { timestamp_osm_base?: string };
  elements: OsmElement[];
};

export function osmId(el: { type: string; id: number }): string {
  return `${el.type}/${el.id}`;
}

/** Geometria de uma way sem os nós que o Overpass omitiu (fora do bbox). */
export function wayCoords(geometry: (LatLon | null)[] | undefined): LatLon[] {
  return (geometry ?? []).filter((p): p is LatLon => p !== null);
}
