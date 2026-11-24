import {
  encodeGround, Ground, type CityMap, type Point, type RoadClass, type TileBuilding, type TileChunk, type TileManifest,
} from "@bigriver/shared";

export type TileOptions = { name: string; metersPerTile: number; chunkSize?: number };
export type TileOutput = { manifest: TileManifest; chunks: TileChunk[] };

const AREA_GROUND: Record<string, number | undefined> = {
  water: Ground.water, park: Ground.grass, grass: Ground.grass, forest: Ground.forest, farmland: Ground.farmland,
};
const MAJOR: RoadClass[] = ["motorway", "trunk", "primary", "secondary"];
const MINOR: RoadClass[] = ["tertiary", "residential", "service", "other", "track"];

/**
 * Rasteriza o CityMap numa grade isométrica e divide em chunks.
 * Grade: coluna = x / metersPerTile (leste), linha = (altura − y) / metersPerTile (sul).
 */
export function buildTiles(map: CityMap, opts: TileOptions): TileOutput {
  const mpt = opts.metersPerTile;
  const size = opts.chunkSize ?? 64;
  const cols = Math.ceil(map.size.width / mpt);
  const rows = Math.ceil(map.size.height / mpt);
  const grid = new Uint8Array(cols * rows).fill(Ground.ground);
  const toTile = ([x, y]: Point): Point => [x / mpt, (map.size.height - y) / mpt];
  const set = (c: number, r: number, v: number) => {
    if (c >= 0 && r >= 0 && c < cols && r < rows) grid[r * cols + c] = v;
  };

  /** Pinta os tiles cujo centro cai dentro do polígono (scanline, regra par-ímpar). */
  const fillPolygon = (rings: Point[][], v: number) => {
    const tr = rings.map((ring) => ring.map(toTile));
    const ys = tr.flat().map((p) => p[1]);
    const r0 = Math.max(0, Math.floor(Math.min(...ys)));
    const r1 = Math.min(rows - 1, Math.ceil(Math.max(...ys)));
    for (let r = r0; r <= r1; r++) {
      const yc = r + 0.5;
      const xs: number[] = [];
      for (const ring of tr)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]!;
          const [xj, yj] = ring[j]!;
          if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k]! - 0.5));
        const c1 = Math.min(cols - 1, Math.floor(xs[k + 1]! - 0.5));
        for (let c = c0; c <= c1; c++) set(c, r, v);
      }
    }
  };

  /** Pinta os tiles a até width/2 metros da linha. */
  const strokeLine = (line: Point[], widthMeters: number, v: number) => {
    const half = Math.max(0.5, widthMeters / mpt / 2);
    const pts = line.map(toTile);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!;
      const [bx, by] = pts[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const c0 = Math.floor(Math.min(ax, bx) - half);
      const c1 = Math.ceil(Math.max(ax, bx) + half);
      const r0 = Math.floor(Math.min(ay, by) - half);
      const r1 = Math.ceil(Math.max(ay, by) + half);
      for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++)
        for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
          const px = c + 0.5;
          const py = r + 0.5;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
          if (Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= half) set(c, r, v);
        }
    }
  };

  // Ordem de pintura: áreas, água, rios, trilhos, ruas (menores antes), prédios.
  const areaOrder = ["farmland", "forest", "grass", "park", "water"];
  for (const kind of areaOrder)
    for (const a of map.areas.filter((a) => a.kind === kind)) fillPolygon(a.polygon, AREA_GROUND[kind]!);
  for (const w of map.waterways) strokeLine(w.line, (w.kind === "river" ? 30 : 6) * map.scale, Ground.water);
  for (const r of map.railways) strokeLine(r.line, 3 * map.scale, Ground.rail);
  const roadsBy = (classes: RoadClass[]) => map.roads.filter((r) => classes.includes(r.class) && !r.bridge);
  for (const r of map.roads.filter((r) => r.class === "path")) strokeLine(r.line, Math.max(r.width, mpt), Ground.path);
  for (const r of map.roads.filter((r) => r.class === "pedestrian")) strokeLine(r.line, Math.max(r.width, mpt), Ground.plaza);
  for (const r of roadsBy(MINOR)) strokeLine(r.line, Math.max(r.width, mpt), Ground.road_minor);
  for (const r of roadsBy(MAJOR)) strokeLine(r.line, Math.max(r.width, mpt), Ground.road_major);
  // Pontes passam por cima da água.
  for (const r of map.roads.filter((r) => r.bridge)) strokeLine(r.line, Math.max(r.width, mpt), MAJOR.includes(r.class) ? Ground.road_major : Ground.road_minor);
  for (const b of map.buildings) fillPolygon(b.polygon, Ground.lot);

  // Prédios: contorno em coordenadas de tile, no chunk do seu centro.
  const chunksX = Math.ceil(cols / size);
  const chunksY = Math.ceil(rows / size);
  const chunkBuildings: TileBuilding[][] = Array.from({ length: chunksX * chunksY }, () => []);
  for (const b of map.buildings) {
    const footprint = b.polygon[0]!.map(toTile).map(([c, r]) => [Math.round(c * 100) / 100, Math.round(r * 100) / 100] as Point);
    const n = footprint.length - 1;
    const cc = footprint.slice(0, n).reduce((s, p) => s + p[0], 0) / n;
    const rc = footprint.slice(0, n).reduce((s, p) => s + p[1], 0) / n;
    const cx = Math.floor(cc / size);
    const cy = Math.floor(rc / size);
    if (cx < 0 || cy < 0 || cx >= chunksX || cy >= chunksY) continue;
    chunkBuildings[cy * chunksX + cx]!.push({ id: b.osmId, kind: b.kind, name: b.name, levels: b.levels, source: b.source, footprint });
  }

  const chunks: TileChunk[] = [];
  for (let cy = 0; cy < chunksY; cy++)
    for (let cx = 0; cx < chunksX; cx++) {
      const bytes = new Uint8Array(size * size).fill(Ground.ground);
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
          const gc = cx * size + c;
          const gr = cy * size + r;
          if (gc < cols && gr < rows) bytes[r * size + c] = grid[gr * cols + gc]!;
        }
      chunks.push({ cx, cy, ground: encodeGround(bytes), buildings: chunkBuildings[cy * chunksX + cx]! });
    }

  // Nascimento na prefeitura, se existir; senão no centro do mapa.
  const townhall = map.pois.find((p) => p.tag === "amenity=townhall" && /prefeitura/i.test(p.name ?? "")) ?? map.pois.find((p) => p.tag === "amenity=townhall");
  const inside = ([c, r]: Point) => c >= 0 && r >= 0 && c < cols && r < rows;
  let spawn: Point = townhall ? toTile(townhall.position) : [cols / 2, rows / 2];
  if (!inside(spawn)) spawn = [cols / 2, rows / 2];
  // Nasce numa rua próxima para não cair dentro de um prédio.
  spawn = nearestWalkable(grid, cols, rows, spawn);

  const pois = map.pois
    .map((p) => ({ id: p.osmId, name: p.name, category: p.category, tile: toTile(p.position) }))
    .filter((p) => inside(p.tile));
  const streets = streetLabels(map, toTile, mpt)
    .map((s) => ({ ...s, points: s.points.filter(inside) }))
    .filter((s) => s.points.length > 0);

  return {
    manifest: {
      cityId: map.cityId, name: opts.name, version: 1, cols, rows, chunkSize: size, chunksX, chunksY,
      metersPerTile: mpt, spawn, pois, streets,
      attribution: [map.source.attribution, ...map.source.extraAttributions],
    },
    chunks,
  };
}

function nearestWalkable(grid: Uint8Array, cols: number, rows: number, [c0, r0]: Point): Point {
  const ok = (c: number, r: number) => {
    const v = grid[r * cols + c];
    return v === Ground.road_minor || v === Ground.road_major || v === Ground.plaza;
  };
  for (let d = 0; d < 60; d++)
    for (let dr = -d; dr <= d; dr++)
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        const c = Math.floor(c0) + dc;
        const r = Math.floor(r0) + dr;
        if (c >= 0 && r >= 0 && c < cols && r < rows && ok(c, r)) return [c + 0.5, r + 0.5];
      }
  return [c0, r0];
}

/** Um rótulo por rua com nome (no meio do trecho mais longo) e pontos a cada ~4 tiles ao longo de todos os trechos. */
function streetLabels(map: CityMap, toTile: (p: Point) => Point, mpt: number) {
  const round = ([c, r]: Point): Point => [Math.round(c * 10) / 10, Math.round(r * 10) / 10];
  const best = new Map<string, { len: number; tile: Point; points: Point[] }>();
  for (const road of map.roads) {
    if (!road.name || road.class === "path") continue;
    const entry = best.get(road.name) ?? { len: -1, tile: [0, 0] as Point, points: [] };
    let len = 0;
    for (let i = 1; i < road.line.length; i++) {
      const a = toTile(road.line[i - 1]!);
      const b = toTile(road.line[i]!);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      len += d;
      for (let t = 0; t < d; t += 4) entry.points.push(round([a[0] + ((b[0] - a[0]) * t) / d, a[1] + ((b[1] - a[1]) * t) / d]));
    }
    if (len > entry.len) {
      entry.len = len;
      entry.tile = round(toTile(road.line[Math.floor(road.line.length / 2)]!));
    }
    best.set(road.name, entry);
  }
  void mpt;
  return [...best].map(([name, { tile, points }]) => ({ name, tile, points }));
}
