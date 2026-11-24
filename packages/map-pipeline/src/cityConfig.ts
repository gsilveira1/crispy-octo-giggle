import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { BBox } from "@bigriver/shared";

/** Configuração de uma cidade, salva em data/cities/<id>/city.json. */
export const CityConfig = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "use só letras minúsculas, números e hífen"),
  name: z.string(),
  state: z.string().default("RS"),
  /** Área baixada do OSM: a mancha urbana com folga. [oeste, sul, leste, norte] */
  downloadBbox: BBox,
  /** Área jogável do MVP, dentro do downloadBbox. */
  playBbox: BBox,
  /** Metros de jogo por metro real. */
  scale: z.number().positive().max(1).default(0.5),
  /** Metros de jogo por tile isométrico. */
  metersPerTile: z.number().positive().default(2),
});
export type CityConfig = z.infer<typeof CityConfig>;

/** Sobe a partir do diretório atual até achar a raiz do monorepo. */
export function repoRoot(start = process.env.INIT_CWD ?? process.cwd()): string {
  let dir = resolve(start);
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("Não achei a raiz do monorepo (pnpm-workspace.yaml).");
    dir = up;
  }
  return dir;
}

export const cityPaths = (id: string, root = repoRoot()) => {
  const dir = join(root, "data", "cities", id);
  return {
    dir,
    config: join(dir, "city.json"),
    query: join(dir, "query.overpassql"),
    raw: join(root, "data", "raw", `${id}.json`),
    build: join(dir, "build"),
  };
};

export async function loadCity(id: string): Promise<CityConfig> {
  const p = cityPaths(id).config;
  if (!existsSync(p)) throw new Error(`Cidade "${id}" não existe. Crie com: pnpm city new ${id} --name "Nome" --bbox=oeste,sul,leste,norte`);
  return CityConfig.parse(JSON.parse(await readFile(p, "utf8")));
}

export async function saveCity(cfg: CityConfig): Promise<string> {
  const p = cityPaths(cfg.id).config;
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(cfg, null, 2) + "\n");
  return p;
}

export function parseBbox(s: string | undefined, flag: string): BBox {
  const b = (s ?? "").split(",").map(Number);
  if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) throw new Error(`${flag} precisa de 4 números: oeste,sul,leste,norte`);
  const [w, so, e, n] = b as BBox;
  if (w >= e || so >= n) throw new Error(`${flag}: oeste < leste e sul < norte`);
  return [w, so, e, n];
}
