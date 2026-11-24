import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { CityMap, type BBox } from "@bigriver/shared";
import { CityConfig, cityPaths, loadCity, repoRoot, saveCity } from "./cityConfig.js";
import { convert } from "./convert.js";
import { coverage } from "./coverage.js";
import type { OverpassResponse } from "./overpass.js";
import { fetchOpenBuildings, type OpenBuildingsFile } from "./openBuildings.js";
import { osmXmlToOverpass } from "./osmxml.js";
import { renderPreview } from "./preview.js";
import { buildTiles } from "./tiles.js";
import { OVERPASS_ENDPOINTS, USER_AGENT, overpassQuery, overpassTurboUrl } from "./query.js";

const rel = (p: string) => relative(repoRoot(), p);

/** Procura a cidade no Nominatim e devolve a bbox do município. */
export async function searchBbox(name: string, state: string): Promise<BBox> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=Brazil&state=${encodeURIComponent(state === "RS" ? "Rio Grande do Sul" : state)}&city=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
  const [hit] = (await res.json()) as { boundingbox: [string, string, string, string]; display_name: string }[];
  if (!hit) throw new Error(`Nominatim não achou "${name}, ${state}"`);
  const [s, n, w, e] = hit.boundingbox.map(Number) as [number, number, number, number];
  console.log(`Achei: ${hit.display_name}`);
  return [w, s, e, n];
}

export async function cmdNew(opts: { id: string; name: string; state: string; bbox?: BBox; playBbox?: BBox; scale: number; search: boolean }) {
  if (existsSync(cityPaths(opts.id).config)) throw new Error(`A cidade "${opts.id}" já existe em ${rel(cityPaths(opts.id).config)}. Edite o arquivo direto.`);
  let bbox = opts.bbox;
  if (!bbox && opts.search) {
    bbox = await searchBbox(opts.name, opts.state);
    console.log("Atenção: a bbox do município inteiro inclui área rural. Ajuste downloadBbox para a mancha urbana.");
  }
  if (!bbox) throw new Error("Informe --bbox=oeste,sul,leste,norte (ou --search para buscar no Nominatim).");
  const cfg = CityConfig.parse({ id: opts.id, name: opts.name, state: opts.state, downloadBbox: bbox, playBbox: opts.playBbox ?? bbox, scale: opts.scale });
  console.log(`Criado ${rel(await saveCity(cfg))}`);
  await cmdQuery(cfg.id);
}

export async function cmdQuery(id: string) {
  const cfg = await loadCity(id);
  const q = overpassQuery(cfg.downloadBbox);
  const p = cityPaths(id);
  await writeFile(p.query, q);
  console.log(`Consulta salva em ${rel(p.query)}`);
  printManualDownload(id, q);
}

function printManualDownload(id: string, q: string) {
  const p = cityPaths(id);
  console.log(`
Para baixar pelo navegador:
  1. Abra este link (já vem com a consulta e executa sozinho):
     ${overpassTurboUrl(q)}
  2. Clique em Exportar → dados OSM brutos (raw OSM data) → download.
  3. Salve o arquivo como ${rel(p.raw)}
  4. Rode: pnpm city build ${id}`);
}

export async function cmdFetch(id: string) {
  const cfg = await loadCity(id);
  const q = overpassQuery(cfg.downloadBbox);
  const p = cityPaths(id);
  await mkdir(dirname(p.raw), { recursive: true });
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Baixando de ${new URL(endpoint).host}...`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = JSON.parse(text) as OverpassResponse;
      if (!Array.isArray(data.elements) || data.elements.length === 0) throw new Error("resposta vazia");
      await writeFile(p.raw, text);
      console.log(`Salvo ${rel(p.raw)} (${data.elements.length} elementos, OSM de ${data.osm3s?.timestamp_osm_base ?? "?"})`);
      return;
    } catch (err) {
      console.warn(`  falhou: ${(err as Error).message}`);
    }
  }
  console.error("\nNão consegui baixar automaticamente.");
  printManualDownload(id, q);
  process.exitCode = 1;
}

export async function readOsmFile(path: string): Promise<OverpassResponse> {
  const text = await readFile(path, "utf8");
  return text.trimStart().startsWith("<") ? osmXmlToOverpass(text) : (JSON.parse(text) as OverpassResponse);
}

export async function cmdBuild(id: string, input?: string) {
  const cfg = await loadCity(id);
  const p = cityPaths(id);
  const src = input ?? p.raw;
  if (!existsSync(src)) {
    console.error(`Falta o arquivo do OSM: ${rel(src)}. Rode "pnpm city fetch ${id}" primeiro.`);
    process.exitCode = 1;
    return;
  }
  const raw = await readOsmFile(src);
  let openBuildings: OpenBuildingsFile | undefined;
  if (cfg.openBuildings.enabled) {
    if (existsSync(p.openBuildings)) openBuildings = JSON.parse(await readFile(p.openBuildings, "utf8")) as OpenBuildingsFile;
    else console.warn(`Aviso: sem ${rel(p.openBuildings)}. Rode "pnpm city buildings ${id}" para preencher os prédios que faltam no OSM.`);
  }
  const map = CityMap.parse(convert(raw, { cityId: cfg.id, bbox: cfg.playBbox, scale: cfg.scale, openBuildings }));
  await mkdir(p.build, { recursive: true });
  await writeFile(join(p.build, `${cfg.id}.map.json`), JSON.stringify(map));
  const cov = coverage(map);
  await writeFile(join(p.build, "coverage.json"), JSON.stringify(cov, null, 2) + "\n");
  await writeFile(join(p.build, "preview-top.svg"), renderPreview(map, { view: "top", pxPerMeter: 0.5 / cfg.scale, gridMeters: 50 }));
  await writeFile(join(p.build, "preview-iso.svg"), renderPreview(map, { view: "iso", metersPerTile: cfg.metersPerTile }));
  const minutes = (Math.max(map.size.width, map.size.height) / 4 / 60).toFixed(1);
  console.log(`${cfg.name}: área jogável ${Math.round(map.size.width)} × ${Math.round(map.size.height)} m de jogo (escala ${cfg.scale}), ~${minutes} min para atravessar a pé.`);
  const bySource = Object.entries(cov.buildingsBySource).map(([k, v]) => `${v} ${k}`).join(", ");
  console.log(`Prédios ${cov.buildings}${bySource ? ` (${bySource})` : ""}, ${cov.buildingsWithLevels} com andares do OSM · POIs ${cov.pois} · bairros ${cov.neighbourhoods.length}`);
  console.log(`Saída em ${rel(p.build)}/`);

  // Mapa isométrico para o cliente do jogo.
  const tiles = buildTiles(map, { name: cfg.name, metersPerTile: cfg.metersPerTile });
  await rm(p.game, { recursive: true, force: true });
  await mkdir(join(p.game, "chunks"), { recursive: true });
  await writeFile(join(p.game, "manifest.json"), JSON.stringify(tiles.manifest));
  for (const ch of tiles.chunks) await writeFile(join(p.game, "chunks", `${ch.cx}_${ch.cy}.json`), JSON.stringify(ch));
  console.log(`Jogo: ${tiles.manifest.cols} × ${tiles.manifest.rows} tiles em ${tiles.chunks.length} chunks → ${rel(p.game)}/`);
}

export async function listCities(): Promise<string[]> {
  const dir = join(repoRoot(), "data", "cities");
  if (!existsSync(dir)) return [];
  const ids = await readdir(dir);
  return ids.filter((id) => existsSync(cityPaths(id).config)).sort();
}

export async function cmdList() {
  for (const id of await listCities()) {
    const cfg = await loadCity(id);
    const has = existsSync(cityPaths(id).raw) ? "OSM baixado" : "OSM não baixado";
    console.log(`${id.padEnd(20)} ${cfg.name.padEnd(24)} escala ${cfg.scale}  ${has}`);
  }
}

export async function cmdBuildings(id: string) {
  const cfg = await loadCity(id);
  const p = cityPaths(id);
  await mkdir(dirname(p.openBuildings), { recursive: true });
  const data = await fetchOpenBuildings(cfg.downloadBbox, cfg.openBuildings.minConfidence);
  await writeFile(p.openBuildings, JSON.stringify(data));
  console.log(`Salvo ${rel(p.openBuildings)}: ${data.buildings.length} prédios com confiança >= ${data.minConfidence}`);
}
