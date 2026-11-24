# @bigriver/map-pipeline

Converte dados do OpenStreetMap em camadas de cidade para o jogo (`CityMap` de `@bigriver/shared`).

## Fluxo

1. Baixar a área urbana: pelo Overpass Turbo com a consulta de [`queries/taquara.overpassql`](queries/taquara.overpassql) (Exportar → dados OSM brutos), ou um `.osm` do botão Exportar do openstreetmap.org. O CLI aceita os dois formatos.
2. Rodar a conversão:

   ```bash
   pnpm --filter @bigriver/map-pipeline import -- \
     --in data/raw/taquara.json --out data/cities/taquara \
     --bbox=-50.83,-29.69,-50.73,-29.61 --scale 0.5
   ```

3. Saídas:
   - `taquara.map.json`: ruas, prédios, áreas, rios, trilhos, POIs e bairros em metros de jogo.
   - `coverage.json`: quantos prédios, quantos com andares, POIs por categoria, km de ruas com nome.
   - `preview-top.svg` e `preview-iso.svg`: prévias para decidir recorte e escala.

## Decisões embutidas (provisórias)

- Projeção SIRGAS 2000 / UTM 22S (EPSG:31982), origem no canto sudoeste do recorte.
- `--scale` comprime a cidade mantendo o traçado (0.5 = metade do tamanho). A escala final é decidida no ticket #5.
- Andares: usa `building:levels` ou `height` quando existem; senão, um padrão por tipo de prédio (casa 1, apartamentos 4, igreja 2...).
- Os dados de saída são um banco derivado do OSM (ODbL): manter a atribuição "© OpenStreetMap contributors" e publicar este pipeline.

## Ainda não faz

- Rasterizar em tiles isométricos e dividir em chunks de 64×64 (depende da escala e do estilo visual).
- Carregar no PostGIS (o plano de longo prazo é Geofabrik → osmium → osm2pgsql).
