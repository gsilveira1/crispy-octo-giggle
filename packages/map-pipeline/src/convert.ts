import type { Area, BBox, Building, CityMap, Line, MapNeighbourhood, Poi, Point, Polygon, Railway, Road, Waterway } from "@bigriver/shared";
import { areaKind, buildingLevels, poiCategory, roadClass, roadWidth } from "./classify.js";
import { osmId, type LatLon, type OsmElement, type OsmRelation, type OsmWay, type OverpassResponse } from "./overpass.js";
import { EPSG_31982, makeProjector, type Projector } from "./projection.js";
import { assembleRings } from "./rings.js";

export type ConvertOptions = {
  cityId: string;
  /** Recorte em WGS84: [oeste, sul, leste, norte]. */
  bbox: BBox;
  /** Metros de jogo por metro real. */
  scale: number;
};

/** Quebra a geometria de uma way nos pontos omitidos pelo Overpass (fora do bbox). */
function pieces(geometry: (LatLon | null)[] | undefined): LatLon[][] {
  const out: LatLon[][] = [[]];
  for (const p of geometry ?? []) {
    if (p) out[out.length - 1]!.push(p);
    else if (out[out.length - 1]!.length > 0) out.push([]);
  }
  return out.filter((s) => s.length >= 2);
}

const isClosed = (g: LatLon[]) => g.length >= 4 && g[0]!.lat === g[g.length - 1]!.lat && g[0]!.lon === g[g.length - 1]!.lon;

function relationPolygons(rel: OsmRelation, proj: Projector): Polygon[] {
  const segs = (role: string) =>
    (rel.members ?? []).filter((m) => m.type === "way" && (m.role === role || (role === "outer" && m.role === ""))).flatMap((m) => pieces(m.geometry));
  const outers = assembleRings(segs("outer")).map((r) => r.map(proj.project));
  const inners = assembleRings(segs("inner")).map((r) => r.map(proj.project));
  // Simplificação: buracos vão para o primeiro anel externo. Suficiente para prédios e áreas do centro.
  return outers.map((o, i) => (i === 0 ? [o, ...inners] : [o]));
}

function centroid(points: Point[]): Point {
  const n = points.length;
  const [sx, sy] = points.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
  return [Math.round((sx / n) * 100) / 100, Math.round((sy / n) * 100) / 100];
}

export function convert(data: OverpassResponse, opts: ConvertOptions): CityMap {
  const proj = makeProjector(opts.bbox, opts.scale);
  const roads: Road[] = [];
  const buildings: Building[] = [];
  const areas: Area[] = [];
  const waterways: Waterway[] = [];
  const railways: Railway[] = [];
  const pois: Poi[] = [];
  const neighbourhoods: MapNeighbourhood[] = [];

  const line = (g: LatLon[]): Line => g.map(proj.project) as Line;

  const addPoi = (el: OsmElement, position: Point) => {
    const tags = el.tags ?? {};
    const poi = poiCategory(tags);
    if (!poi) return;
    pois.push({ osmId: osmId(el), name: tags.name, category: poi.category, tag: poi.tag, position });
  };

  const addPolygonFeature = (el: OsmElement, polygons: Polygon[]) => {
    const tags = el.tags ?? {};
    for (const polygon of polygons) {
      if (tags.building && tags.building !== "no") {
        const { levels, fromOsm } = buildingLevels(tags);
        buildings.push({ osmId: osmId(el), kind: tags.building, name: tags.name, levels, levelsFromOsm: fromOsm, polygon });
        continue;
      }
      const kind = areaKind(tags);
      if (kind) areas.push({ osmId: osmId(el), kind, name: tags.name, polygon });
    }
    const first = polygons[0]?.[0];
    if (first) addPoi(el, centroid(first.slice(0, -1)));
  };

  for (const el of data.elements) {
    const tags = el.tags ?? {};
    if (el.type === "node") {
      addPoi(el, proj.project(el));
      continue;
    }
    if (el.type === "way") {
      handleWay(el);
      continue;
    }
    if (tags.boundary === "administrative" && tags.admin_level === "10" && tags.name) {
      const polygons = relationPolygons(el, proj);
      if (polygons.length > 0) neighbourhoods.push({ osmId: osmId(el), name: tags.name, polygons });
      continue;
    }
    if (tags.type === "multipolygon") addPolygonFeature(el, relationPolygons(el, proj));
  }

  function handleWay(el: OsmWay) {
    const tags = el.tags ?? {};
    const parts = pieces(el.geometry);
    const cls = roadClass(tags);
    if (cls && tags.area !== "yes") {
      for (const g of parts)
        roads.push({
          osmId: osmId(el), name: tags.name, ref: tags.ref, class: cls,
          oneway: tags.oneway === "yes" || tags.junction === "roundabout",
          bridge: tags.bridge !== undefined && tags.bridge !== "no",
          width: Math.round(roadWidth(tags, cls) * opts.scale * 100) / 100,
          line: line(g),
        });
      return;
    }
    if (tags.waterway && !["riverbank", "dam", "weir"].includes(tags.waterway)) {
      for (const g of parts) waterways.push({ osmId: osmId(el), kind: tags.waterway, name: tags.name, line: line(g) });
      return;
    }
    if (tags.railway && !["platform", "station"].includes(tags.railway)) {
      for (const g of parts) railways.push({ osmId: osmId(el), kind: tags.railway, line: line(g) });
      return;
    }
    const closed = parts.length === 1 && isClosed(parts[0]!);
    if (closed) addPolygonFeature(el, [[line(parts[0]!) as Point[]]]);
  }

  return {
    cityId: opts.cityId,
    source: {
      attribution: "© OpenStreetMap contributors",
      license: "ODbL-1.0",
      osmTimestamp: data.osm3s?.timestamp_osm_base,
      bbox: opts.bbox,
      projection: "EPSG:31982",
    },
    scale: opts.scale,
    size: { width: proj.width, height: proj.height },
    roads, buildings, areas, waterways, railways, pois, neighbourhoods,
  };
}

export { EPSG_31982 };
