#!/usr/bin/env node
import { parseArgs } from "node:util";
import { parseBbox } from "./cityConfig.js";
import { cmdBuild, cmdFetch, cmdList, cmdNew, cmdQuery, listCities } from "./commands.js";

const HELP = `Uso: pnpm city <comando> [opções]

Comandos:
  new <id> --name "Nome" (--bbox=oeste,sul,leste,norte | --search) [--play-bbox=...] [--scale 0.5] [--state RS]
                    cria data/cities/<id>/city.json e a consulta do Overpass
  query <id>        regera a consulta e mostra o link para baixar pelo navegador
  fetch <id>        baixa os dados do Overpass para data/raw/<id>.json
  build <id> [--in arquivo.json|.osm]
                    converte para data/cities/<id>/build/ (mapa, cobertura, prévias)
  all               fetch + build de todas as cidades (pula o fetch se já baixado, a menos que --refresh)
  list              lista as cidades configuradas

Use sempre --bbox=... com "=" porque os números começam com "-".`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: "string" }, state: { type: "string", default: "RS" },
      bbox: { type: "string" }, "play-bbox": { type: "string" },
      scale: { type: "string", default: "0.5" }, search: { type: "boolean", default: false },
      in: { type: "string" }, refresh: { type: "boolean", default: false }, help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, id] = positionals;
  const needId = () => {
    if (!id) throw new Error(`Faltou o id da cidade. Ex.: pnpm city ${cmd} taquara`);
    return id;
  };
  switch (cmd) {
    case "new":
      if (!values.name) throw new Error('Faltou --name "Nome da cidade"');
      return cmdNew({
        id: needId(), name: values.name, state: values.state!, scale: Number(values.scale), search: values.search!,
        bbox: values.bbox ? parseBbox(values.bbox, "--bbox") : undefined,
        playBbox: values["play-bbox"] ? parseBbox(values["play-bbox"], "--play-bbox") : undefined,
      });
    case "query": return cmdQuery(needId());
    case "fetch": return cmdFetch(needId());
    case "build": return cmdBuild(needId(), values.in);
    case "list": return cmdList();
    case "all": {
      const { existsSync } = await import("node:fs");
      const { cityPaths } = await import("./cityConfig.js");
      for (const c of await listCities()) {
        if (values.refresh || !existsSync(cityPaths(c).raw)) await cmdFetch(c);
        await cmdBuild(c);
      }
      return;
    }
    default:
      console.log(HELP);
      if (!values.help) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Erro: ${(err as Error).message}`);
  process.exit(1);
});
