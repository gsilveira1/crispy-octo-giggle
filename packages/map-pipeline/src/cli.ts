#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CityMap, type BBox } from "@bigriver/shared";
import { convert } from "./convert.js";
import { coverage } from "./coverage.js";
import type { OverpassResponse } from "./overpass.js";
import { osmXmlToOverpass } from "./osmxml.js";
import { renderPreview } from "./preview.js";

const HELP = `Uso: bigriver-map --in <overpass.json> --out <pasta> --bbox=oeste,sul,leste,norte [--scale 0.5] [--city taquara]

Converte uma resposta do Overpass (JSON com out body geom) ou um arquivo .osm (XML) em:
  <city>.map.json    camadas da cidade em metros de jogo (schema CityMap)
  coverage.json      contagens de cobertura do OSM
  preview-top.svg    prévia vista de cima com grade de 50 m de jogo
  preview-iso.svg    prévia isométrica`;

async function main() {
  const { values } = parseArgs({
    options: {
      in: { type: "string" }, out: { type: "string" }, bbox: { type: "string" },
      scale: { type: "string", default: "0.5" }, city: { type: "string", default: "taquara" },
      "meters-per-tile": { type: "string", default: "2" }, help: { type: "boolean" },
    },
  });
  if (values.help || !values.in || !values.out || !values.bbox) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }
  const bbox = values.bbox.split(",").map(Number) as BBox;
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) throw new Error("--bbox precisa de 4 números");
  const scale = Number(values.scale);
  const text = await readFile(values.in, "utf8");
  const raw = text.trimStart().startsWith("<") ? osmXmlToOverpass(text) : (JSON.parse(text) as OverpassResponse);
  const map = CityMap.parse(convert(raw, { cityId: values.city!, bbox, scale }));
  await mkdir(values.out, { recursive: true });
  await writeFile(join(values.out, `${values.city}.map.json`), JSON.stringify(map));
  const cov = coverage(map);
  await writeFile(join(values.out, "coverage.json"), JSON.stringify(cov, null, 2));
  await writeFile(join(values.out, "preview-top.svg"), renderPreview(map, { view: "top", pxPerMeter: 0.5 / scale, gridMeters: 50 }));
  await writeFile(join(values.out, "preview-iso.svg"), renderPreview(map, { view: "iso", metersPerTile: Number(values["meters-per-tile"]) }));
  console.log(`Mapa ${map.size.width}×${map.size.height} m de jogo (escala ${scale}).`);
  console.log(JSON.stringify({ ...cov, buildingKinds: undefined }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
