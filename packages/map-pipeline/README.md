# @bigriver/map-pipeline

Converte dados do OpenStreetMap em camadas de cidade para o jogo (`CityMap` de `@bigriver/shared`).

**Para adicionar ou atualizar uma cidade, siga [data/cities/README.md](../../data/cities/README.md)** (`pnpm city new | fetch | build`).

## Módulos

| Arquivo | O que faz |
|---|---|
| `src/cli.ts`, `src/commands.ts` | Comandos `pnpm city ...` |
| `src/cityConfig.ts` | Schema do `city.json` e caminhos de cada cidade |
| `src/query.ts` | Consulta Overpass e link do Overpass Turbo |
| `src/openBuildings.ts` | Baixa e filtra o Google Open Buildings por célula S2 |
| `src/osmxml.ts` | Lê `.osm` (XML) além do JSON do Overpass |
| `src/convert.ts` | OSM → `CityMap` (projeção, escala, classificação, recorte) |
| `src/classify.ts` | Regras de ruas, andares padrão, áreas e POIs |
| `src/coverage.ts` | Relatório de cobertura |
| `src/preview.ts` | Prévias SVG de cima e isométrica |

## Decisões embutidas (provisórias)

- Projeção SIRGAS 2000 / UTM 22S (EPSG:31982), origem no canto sudoeste da área jogável. Serve para todo o RS.
- `scale` comprime a cidade mantendo o traçado. A escala final é decidida no issue #5.
- Andares: usa `building:levels` ou `height` quando existem; senão, um padrão por tipo de prédio.
- Prédios que faltam no OSM vêm do Google Open Buildings (ODbL, decisão do #13). O OSM ganha onde os dois têm prédio; a altura do Open Buildings é estimada pela área.
- Elementos totalmente fora da área jogável são descartados; os que cruzam a borda são mantidos inteiros.

## Ainda não faz

- Rasterizar em tiles isométricos e dividir em chunks de 64×64 (depende da escala e do estilo visual).
- Carregar no PostGIS.

## Testes

```bash
pnpm --filter @bigriver/map-pipeline test
```
