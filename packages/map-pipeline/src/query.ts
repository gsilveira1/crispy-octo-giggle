import type { BBox } from "@bigriver/shared";

/** Consulta Overpass com tudo que o conversor usa. A bbox do Overpass é sul,oeste,norte,leste. */
export function overpassQuery([w, s, e, n]: BBox): string {
  return `[out:json][timeout:180][bbox:${s},${w},${n},${e}];
(
  way["highway"];
  way["building"];
  nwr["building"]["type"="multipolygon"];
  nwr["landuse"];
  nwr["leisure"];
  nwr["natural"~"water|wood|scrub|grassland|wetland"];
  nwr["waterway"];
  nwr["amenity"];
  nwr["shop"];
  nwr["tourism"];
  node["place"];
  way["railway"];
  relation["boundary"="administrative"]["admin_level"~"^(8|10)$"];
);
out body geom qt;
`;
}

/** Link do Overpass Turbo que já abre com a consulta preenchida e executa. */
export function overpassTurboUrl(query: string): string {
  return `https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&R`;
}

export const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
export const USER_AGENT = "big-river-mmorpg-map-pipeline/0.1 (+https://github.com/gsilveira1/crispy-octo-giggle)";
