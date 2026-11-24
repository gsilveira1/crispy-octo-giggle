import type { AreaKind, PoiCategory, RoadClass } from "@bigriver/shared";
import type { Tags } from "./overpass.js";

const ROAD_CLASS: Record<string, RoadClass> = {
  motorway: "motorway", motorway_link: "motorway",
  trunk: "trunk", trunk_link: "trunk",
  primary: "primary", primary_link: "primary",
  secondary: "secondary", secondary_link: "secondary",
  tertiary: "tertiary", tertiary_link: "tertiary",
  residential: "residential", unclassified: "residential", living_street: "residential",
  service: "service",
  pedestrian: "pedestrian",
  footway: "path", path: "path", cycleway: "path", steps: "path",
  track: "track",
};

/** Largura real típica em metros, antes da escala. */
const ROAD_WIDTH: Record<RoadClass, number> = {
  motorway: 14, trunk: 12, primary: 10, secondary: 9, tertiary: 8,
  residential: 7, service: 4, pedestrian: 5, path: 2, track: 3, other: 4,
};

const IGNORED_HIGHWAYS = new Set(["proposed", "construction", "abandoned", "razed", "platform", "bus_stop", "corridor", "elevator"]);

export function roadClass(tags: Tags): RoadClass | null {
  const hw = tags.highway;
  if (!hw || IGNORED_HIGHWAYS.has(hw)) return null;
  return ROAD_CLASS[hw] ?? "other";
}

export function roadWidth(tags: Tags, cls: RoadClass): number {
  const w = Number.parseFloat(tags.width ?? "");
  if (Number.isFinite(w) && w > 0 && w < 60) return w;
  const lanes = Number.parseInt(tags.lanes ?? "", 10);
  if (Number.isFinite(lanes) && lanes > 0 && lanes < 10) return Math.max(ROAD_WIDTH[cls], lanes * 3.25);
  return ROAD_WIDTH[cls];
}

/** Andares padrão por tipo de prédio, já que o OSM raramente traz altura. */
const DEFAULT_LEVELS: Record<string, number> = {
  house: 1, detached: 1, bungalow: 1, hut: 1, shed: 1, garage: 1, garages: 1, roof: 1, kiosk: 1,
  residential: 2, semidetached_house: 2, terrace: 2,
  apartments: 4,
  commercial: 2, retail: 2, office: 3, hotel: 4,
  church: 2, cathedral: 3, chapel: 1,
  school: 2, university: 3, college: 3, hospital: 3, public: 2, civic: 2, government: 2,
  industrial: 1, warehouse: 1, supermarket: 1, farm_auxiliary: 1, barn: 1,
};

export function buildingLevels(tags: Tags): { levels: number; fromOsm: boolean } {
  const lv = Number.parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(lv) && lv >= 1 && lv < 80) return { levels: Math.round(lv), fromOsm: true };
  const h = Number.parseFloat(tags.height ?? "");
  if (Number.isFinite(h) && h > 0 && h < 300) return { levels: Math.max(1, Math.round(h / 3)), fromOsm: true };
  return { levels: DEFAULT_LEVELS[tags.building ?? ""] ?? 1, fromOsm: false };
}

export function areaKind(tags: Tags): AreaKind | null {
  if (tags.natural === "water" || tags.waterway === "riverbank" || tags.landuse === "reservoir" || tags.landuse === "basin") return "water";
  if (tags.leisure === "park" || tags.leisure === "garden" || tags.leisure === "playground" || tags.place === "square") return "park";
  if (tags.leisure === "pitch" || tags.leisure === "sports_centre" || tags.leisure === "stadium") return "park";
  if (tags.landuse === "forest" || tags.natural === "wood") return "forest";
  if (tags.landuse === "grass" || tags.landuse === "meadow" || tags.natural === "grassland" || tags.natural === "scrub" || tags.natural === "wetland" || tags.landuse === "recreation_ground" || tags.landuse === "cemetery") return "grass";
  if (tags.landuse === "residential") return "residential";
  if (tags.landuse === "commercial" || tags.landuse === "retail") return "commercial";
  if (tags.landuse === "industrial") return "industrial";
  if (tags.landuse === "farmland" || tags.landuse === "orchard" || tags.landuse === "farmyard") return "farmland";
  if (tags.landuse) return "other";
  return null;
}

const POI_RULES: [string, RegExp, PoiCategory][] = [
  ["amenity", /^(townhall|courthouse|police|fire_station|post_office|community_centre|library|public_building)$/, "civic"],
  ["amenity", /^place_of_worship$/, "religious"],
  ["amenity", /^(school|kindergarten|college|university)$/, "education"],
  ["amenity", /^(hospital|clinic|doctors|dentist|pharmacy)$/, "health"],
  ["amenity", /^(restaurant|cafe|bar|pub|fast_food|ice_cream)$/, "food"],
  ["amenity", /^(bus_station|taxi|fuel|parking)$/, "transport"],
  ["shop", /.*/, "shop"],
  ["leisure", /^(park|playground|sports_centre|stadium|pitch|garden)$/, "leisure"],
  ["tourism", /.*/, "tourism"],
  ["amenity", /.*/, "other"],
];

export function poiCategory(tags: Tags): { category: PoiCategory; tag: string } | null {
  for (const [k, re, cat] of POI_RULES) {
    const v = tags[k];
    if (v && re.test(v)) return { category: cat, tag: `${k}=${v}` };
  }
  return null;
}
