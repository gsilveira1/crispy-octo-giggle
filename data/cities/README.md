# Como adicionar uma cidade

Cada cidade do jogo é uma pasta aqui, com um `city.json` que diz qual área baixar do OpenStreetMap, qual parte é jogável e em que escala. Os comandos abaixo rodam da raiz do repositório e precisam de Node 22+ e pnpm 10 (`pnpm install` uma vez).

## Passo a passo

### 1. Achar o recorte

Abra a cidade no [openstreetmap.org](https://www.openstreetmap.org), clique em **Exportar** e use **Selecionar manualmente uma área diferente** para desenhar o retângulo. O site mostra os quatro números (oeste, sul, leste, norte).

- **Área de download** (`--bbox`): a mancha urbana com folga.
- **Área jogável** (`--play-bbox`): o pedaço que vira jogo no MVP, normalmente o centro (uns 2 × 2 km).

Se preferir, `--search` busca a cidade no Nominatim e usa o retângulo do município inteiro (inclui área rural, então ajuste depois).

### 2. Criar a cidade

```bash
pnpm city new santa-cruz-do-sul --name "Santa Cruz do Sul" \
  --bbox=-52.47,-29.75,-52.38,-29.68 \
  --play-bbox=-52.44,-29.73,-52.42,-29.71 \
  --scale 0.5
```

Isso cria `data/cities/santa-cruz-do-sul/city.json` e `query.overpassql`. Use sempre `--bbox=` com o sinal de igual, porque os números começam com `-`.

### 3. Baixar os dados do OSM

```bash
pnpm city fetch santa-cruz-do-sul
```

Salva em `data/raw/santa-cruz-do-sul.json` (fora do git). Se o download automático falhar, o comando mostra um link do Overpass Turbo que já abre com a consulta: clique em **Exportar → dados OSM brutos → download** e salve com o nome indicado.

### 4. Converter

```bash
pnpm city build santa-cruz-do-sul
```

Gera em `data/cities/santa-cruz-do-sul/build/` (fora do git, é recriado a qualquer momento):

| Arquivo | Para quê |
|---|---|
| `<id>.map.json` | Ruas, prédios, áreas, rios, POIs e bairros em metros de jogo (schema `CityMap`) |
| `coverage.json` | Quanto o OSM tem: prédios, prédios com andares, POIs, km de ruas com nome |
| `preview-top.svg` | Prévia de cima, com grade de 50 m de jogo |
| `preview-iso.svg` | Prévia isométrica |

Abra os SVGs no navegador para conferir recorte e escala. Ajuste `playBbox` ou `scale` no `city.json` e rode `build` de novo (não precisa baixar de novo).

## Outros comandos

```bash
pnpm city list            # cidades configuradas e se o OSM já foi baixado
pnpm city query <id>      # regera a consulta e mostra o link do navegador
pnpm city all             # baixa (se faltar) e converte todas as cidades
pnpm city all --refresh   # baixa tudo de novo (dados mais recentes do OSM)
pnpm city build <id> --in arquivo.osm   # converte um .osm exportado do openstreetmap.org
```

## Campos do `city.json`

| Campo | Significado |
|---|---|
| `id` | Nome da pasta, minúsculas e hífen |
| `name` | Nome exibido |
| `downloadBbox` | Área baixada do OSM `[oeste, sul, leste, norte]` |
| `playBbox` | Área jogável, dentro da de download |
| `scale` | Metros de jogo por metro real (0.5 = cidade com metade do tamanho) |
| `metersPerTile` | Metros de jogo por tile isométrico |

## Licença dos dados

Os mapas gerados são derivados do OpenStreetMap (ODbL). Mantenha o crédito "© OpenStreetMap contributors" no jogo e neste repositório, e mantenha este pipeline público para que o banco derivado possa ser recriado.
