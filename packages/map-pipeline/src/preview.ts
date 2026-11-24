import { toIso, type CityMap, type Point, type RoadClass } from "@bigriver/shared";

export type PreviewOptions = {
  /** "top" = vista de cima; "iso" = projeção isométrica 2:1. */
  view: "top" | "iso";
  /** Pixels por metro de jogo na vista de cima. */
  pxPerMeter?: number;
  /** Metros de jogo por tile, usado na vista iso. */
  metersPerTile?: number;
  /** Grade de tiles desenhada por cima (só vista de cima), em metros de jogo. */
  gridMeters?: number;
};

const AREA_COLORS: Record<string, string> = {
  water: "#8ec5e8", park: "#b5dba0", forest: "#8fbf7a", grass: "#cfe8b8",
  residential: "#ece6df", commercial: "#f2d9d9", industrial: "#e3d8ec", farmland: "#f1eccd", other: "#eeeeee",
};
const ROAD_COLORS: Partial<Record<RoadClass, string>> = {
  motorway: "#e892a2", trunk: "#f9b29c", primary: "#fcd6a4", secondary: "#f7fabf", tertiary: "#ffffff",
};
const POI_COLORS: Record<string, string> = {
  civic: "#c0392b", religious: "#8e44ad", education: "#2980b9", health: "#27ae60", food: "#e67e22",
  shop: "#d35400", leisure: "#16a085", transport: "#34495e", tourism: "#f1c40f", other: "#7f8c8d",
};

export function renderPreview(map: CityMap, opts: PreviewOptions): string {
  const k = opts.pxPerMeter ?? 0.5;
  const mpt = opts.metersPerTile ?? 2;
  const tileW = 32;
  const project = (p: Point): Point => (opts.view === "iso" ? toIso(p, mpt, tileW) : [p[0] * k, (map.size.height - p[1]) * k]);
  const scaleW = opts.view === "iso" ? tileW / mpt / Math.SQRT2 : k; // px por metro aproximado
  const fmt = (p: Point) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const path = (pts: Point[], close = false) => `M${pts.map((p) => fmt(project(p))).join("L")}${close ? "Z" : ""}`;

  // Limites para o viewBox.
  const corners: Point[] = [[0, 0], [map.size.width, 0], [0, map.size.height], [map.size.width, map.size.height]].map((c) => project(c as Point));
  const minX = Math.min(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1]));
  const w = Math.max(...corners.map((c) => c[0])) - minX;
  const h = Math.max(...corners.map((c) => c[1])) - minY;

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}">`);
  out.push(`<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#f7f4ee"/>`);
  if (opts.view === "iso") out.push(`<path d="${path(corners.length ? [[0, 0], [map.size.width, 0], [map.size.width, map.size.height], [0, map.size.height]] : [], true)}" fill="#efeae0"/>`);

  for (const a of map.areas) out.push(`<path d="${a.polygon.map((r) => path(r, true)).join("")}" fill="${AREA_COLORS[a.kind]}" fill-rule="evenodd"/>`);
  for (const wtr of map.waterways) out.push(`<path d="${path(wtr.line)}" fill="none" stroke="#6aaedb" stroke-width="${Math.max(1, (wtr.kind === "river" ? 20 : 4) * map.scale * scaleW)}" stroke-linecap="round"/>`);
  for (const r of map.railways) out.push(`<path d="${path(r.line)}" fill="none" stroke="#777" stroke-width="1.5" stroke-dasharray="4 3"/>`);

  const ordered = [...map.roads].sort((a, b) => b.width - a.width);
  for (const r of ordered) out.push(`<path d="${path(r.line)}" fill="none" stroke="#b9b2a8" stroke-width="${(Math.max(1, r.width * scaleW) + 1.2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of ordered.reverse())
    out.push(`<path d="${path(r.line)}" fill="none" stroke="${ROAD_COLORS[r.class] ?? "#ffffff"}" stroke-width="${Math.max(1, r.width * scaleW).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"${r.class === "path" ? ' stroke-dasharray="2 2"' : ""}/>`);

  for (const b of map.buildings) out.push(`<path d="${b.polygon.map((r) => path(r, true)).join("")}" fill="${b.levelsFromOsm ? "#c9a27e" : "#d9cfc4"}" stroke="#a8998a" stroke-width="0.5"/>`);

  for (const n of map.neighbourhoods)
    for (const poly of n.polygons) out.push(`<path d="${path(poly[0]!, true)}" fill="none" stroke="#9b59b6" stroke-width="2" stroke-dasharray="8 4" opacity="0.6"/>`);

  if (opts.view === "top" && opts.gridMeters) {
    const g = opts.gridMeters;
    for (let x = 0; x <= map.size.width; x += g) out.push(`<path d="${path([[x, 0], [x, map.size.height]])}" stroke="#000" stroke-opacity="0.08" stroke-width="1"/>`);
    for (let y = 0; y <= map.size.height; y += g) out.push(`<path d="${path([[0, y], [map.size.width, y]])}" stroke="#000" stroke-opacity="0.08" stroke-width="1"/>`);
  }

  for (const p of map.pois) {
    const [x, y] = project(p.position);
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${POI_COLORS[p.category]}"/>`);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  for (const p of map.pois.filter((p) => p.name && (p.category === "civic" || p.category === "religious"))) {
    const [x, y] = project(p.position);
    out.push(`<text x="${(x + 5).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-family="sans-serif" font-size="11" fill="#222" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(p.name!)}</text>`);
  }
  out.push(`<text x="${minX + 8}" y="${minY + h - 8}" font-family="sans-serif" font-size="12" fill="#555">© OpenStreetMap contributors</text>`);
  out.push("</svg>");
  return out.join("\n");
}
