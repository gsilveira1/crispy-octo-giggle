# O que o OSM tem do centro de Taquara? (pesquisa #3)

_Data: 2026-11-24. Pergunta do ticket #3, filho do mapa #1._

> **Limitação importante desta pesquisa.** O ambiente onde ela rodou bloqueava as fontes de dados brutos do OSM: Overpass (overpass-api.de e espelhos), API 0.6 (`api.openstreetmap.org`), Geofabrik, tiles, taginfo e ohsome (consulta). Só foi possível ler páginas individuais de objetos em `www.openstreetmap.org`, a wiki e a OSMF. Portanto **não há contagens medidas** (nº de prédios, % com `building:levels` etc.) neste documento. Tudo que está marcado como **[verificado]** foi lido em uma página de objeto OSM; o resto é **[a medir]**, com a consulta pronta na seção 4. Rodar o script da seção 4 numa máquina com internet livre é o primeiro passo do ticket de importação.

## 1. Resposta curta

- O OSM tem a **malha viária** e a **divisão de bairros** de Taquara com boa estrutura; prédios, alturas e POIs **não puderam ser medidos** e devem ser tratados como fracos até prova em contrário (padrão em cidades médias do interior do RS que não receberam importação nem tarefa HOT).
- Taquara **não** esteve em nenhum projeto de mapeamento das enchentes de 2024 (as tarefas HOT cobriram Vale do Taquari, Porto Alegre, e só *ruas* de Rolante #17205 e Três Coroas #17265) e **não** teve importação de prédios (a única importação municipal de edificações documentada no RS é a de Porto Alegre/PMPA). Logo, contornos de prédios vêm só de mapeamento manual voluntário.
- Plano B para prédios: **Google Open Buildings v3** cobre o Brasil (imagens de mai/2023), licença dupla **CC BY 4.0 ou ODbL** — pode ser usado como camada de preenchimento. Não traz altura nem tipo.
- Extração: **Geofabrik `sul` (.osm.pbf) → `osmium extract` com bbox/polígono do centro → `osm2pgsql` 2.3.x (saída flex) no PostGIS**. Overpass serve só para inspeção/QA, não para o pipeline.
- Licença: o jogo é **Produced Work** (crédito obrigatório "© OpenStreetMap contributors", no jogo/splash/créditos + link para openstreetmap.org/copyright); o **banco PostGIS derivado** (OSM + nossas correções) é **Derivative Database** e precisa ser oferecido sob ODbL a quem pedir. Arte, código e dados de jogo independentes podem ficar fechados (Collective Database).

## 2. O que foi verificado no OSM

| Item | Evidência | Status |
|---|---|---|
| Bairros (admin_level=10) de Taquara | Relações criadas por `santamariense` no changeset 66984092 ("Delimitado os bairros de Taquara"), ex.: *Recreio* r9303518 (IBGE 4321204016, pop. 1075), *Santa Maria* r9303527 (IBGE 4321204018). Fonte: "IBGE Setores Censitários", pop. IBGE 2010, versão 1 (nunca revisadas). | [verificado] — limites aproximados (setores censitários), não oficiais |
| Via principal ERS-020 no centro | *Avenida Sebastião Amoretti* w303100482: `highway=primary`, `official_name=Rodovia Teixeirinha`, `ref=ERS-020`, `oneway=yes`, `surface=asphalt`; último changeset "Correções de roteamento em Taquara, RS". | [verificado] |
| Linhas de ônibus intermunicipais | A mesma via é membro de 23 relações de rota (TCO-POA via TAQ, CAN-POA via TAQ, GRA-POA…). Acesso pela RS-115/ERS-020 com `destination=Taquara;Igrejinha` (w837880926, editado pela Kaart via MapRoulette). | [verificado] — indica que há mapeadores ativos de transporte na região |
| Fontes usadas na região | `source=Bing`, `source=IBGE`, `source:name=survey`, `maxspeed` implícito. | [verificado] em amostras |

Observação de qualidade geral: as relações de bairro estão na versão 1 com população de 2010; ruas da região recebem edições de empresas (Kaart) para roteamento, o que tende a deixar **nomes, sentido único e classificação de vias em bom estado** e **prédios/POIs para trás**.

## 3. O que precisa ser medido (e o que esperar)

| Camada | Tags | Expectativa (não medida) | Risco para o jogo |
|---|---|---|---|
| Ruas | `highway=*`, `name`, `oneway`, `surface`, `sidewalk` | Boa: malha completa e nomeada | Baixo |
| Prédios | `building=*`, `building:levels`, `height` | Cobertura parcial no centro; `building:levels` raro; `height` quase inexistente | **Alto**: isométrico precisa de contorno + altura. Planejar altura padrão (ex.: 2 andares) e preenchimento com Google Open Buildings |
| Uso do solo | `landuse=*` (residential, commercial, retail) | Polígonos grandes e grosseiros, ou ausentes | Médio: dá para derivar "tipo de quarteirão" dos POIs |
| POIs | `amenity=townhall`, `place_of_worship`, `leisure=park`, `shop=*`, `amenity=*` | Os marcos principais (prefeitura, igreja matriz, praças) provavelmente existem como ponto; comércio esparso e desatualizado | Médio: marcos podem ser curados à mão (são poucos) |
| Rio e verde | `waterway=river` (Rio dos Sinos / Rio Paranhana), `natural=water`, `leisure=park`, `natural=wood` | Rios como linha, provavelmente de base IBGE; margens como área talvez ausentes | Baixo/médio |

Onde a cobertura tende a ser fraca: `building:levels`/`height`, `addr:*`, horários e nomes de comércio, `landuse` fino, áreas de água (só linha central do rio), calçadas/praças como área.

## 4. Como extrair (pipeline recomendado)

1. **Download**: extrato Geofabrik da região Sul do Brasil, `https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf` (atualização diária; arquivo com `.osm.pbf` + `state.txt` para replicação).
2. **Recorte**: `osmium extract -b <minlon>,<minlat>,<maxlon>,<maxlat> sul-latest.osm.pbf -o taquara-centro.osm.pbf --strategy=smart` (bbox inicial a calibrar no mapa: em torno de lon −50.79…−50.77, lat −29.66…−29.64). Para o jogo inteiro da cidade, usar o polígono da relação municipal (admin_level=8).
3. **Carga**: `osm2pgsql` **2.3.1 (05/07/2026)** com **saída flex** (script Lua) gerando tabelas próprias (`roads`, `buildings`, `pois`, `landuse`, `water`) em SRID 4326 ou 3857, com `--slim` se quiser atualizar via `osm2pgsql-replication`. A saída flex é hoje a padrão (até o OSM-Carto migrou para ela em abr/2026). Drizzle lê essas tabelas como fonte; nossas edições ficam em tabelas separadas (ver §5).
4. **Overpass** só para QA e inspeção. Consultas de medição (rodar em overpass-turbo.eu):

```
[out:json][timeout:60];
area["boundary"="administrative"]["admin_level"="8"]["name"="Taquara"]->.m;
// troque por um bbox do centro se preferir: (-29.66,-50.79,-29.64,-50.77)
(way["building"](area.m);)->.b;
.b out count;
way["building"]["building:levels"](area.m); out count;
way["building"]["height"](area.m); out count;
way["highway"](area.m); out count;
way["highway"]["name"](area.m); out count;
nwr["amenity"](area.m); out count;
nwr["shop"](area.m); out count;
nwr["amenity"~"townhall|place_of_worship"](area.m); out tags center;
nwr["leisure"~"park|garden"](area.m); out tags center;
nwr["landuse"](area.m); out count;
nwr["waterway"](area.m); out tags;
```

Também vale comparar a contagem de prédios do OSM com a do Google Open Buildings no mesmo bbox para estimar o % de cobertura.

## 5. Obrigações da ODbL para o jogo

Fontes: OSMF *Attribution Guidelines* (adotadas 2021-06-25, página editada em 10/09/2026), *Licence and Legal FAQ*, *Produced Work – Guideline*.

- **Atribuição** (sempre): texto que nomeie "OpenStreetMap" e indique a ODbL; "© OpenStreetMap contributors" com link para `https://www.openstreetmap.org/copyright`. Para **jogos** o guia aceita splash de abertura, a própria tela de jogo, créditos ou menu, desde que legível e com "informação detalhada" acessível em local fácil (ex.: botão "(i)"/Sobre com o link). No **admin MapLibre**, crédito no canto do mapa (padrão do controle de atribuição).
- **Jogo = Produced Work**: pode ter qualquer licença (código e arte fechados), mas quem receber pode pedir os dados por trás.
- **Banco derivado** (OSM + correções/alturas/limpezas que fizermos sobre os objetos do OSM) é **Derivative Database**: ao uso público (o jogo é lançamento público), temos que oferecê-lo sob ODbL **ou** oferecer o "meio de recriá-lo" (ex.: o script osm2pgsql/Lua + o arquivo de diffs). Devolver as correções ao OSM é preferido, não obrigatório.
- **Collective Database**: dados independentes (posição de NPCs, quests, inventários, contas de jogadores, arte de tiles) ficam fora do share-alike, desde que mantidos em tabelas separadas e não sejam "correções" dos objetos OSM. Por isso: manter **tabelas OSM puras + tabela de overrides** separada.
- **Google Open Buildings** (se usado): escolher a licença ODbL dele simplifica (mistura homogênea) ou CC BY 4.0 com crédito "Google Open Buildings" ao lado do crédito OSM.
- Ação prática: tela "Créditos/Sobre" com o texto e link, crédito no rodapé do minimapa, e uma página pública (ou repositório) com o pipeline de extração + overrides em ODbL.

## 6. Recomendações para o MVP

1. Rodar as consultas da §4 antes de fechar o escopo do mapa; se `building` cobrir < ~60% do centro, planejar o preenchimento com Open Buildings ou mapeamento próprio (devolvido ao OSM).
2. Assumir que **altura não existe**: regra padrão por tipo (`building=house` 1–2 andares, comercial 2–3) e override manual dos marcos.
3. Curar à mão os ~10–20 marcos do centro (prefeitura, matriz, praças, rodoviária) — mais barato que confiar nas tags.
4. Desenhar o schema já separando dado OSM de dado do jogo, para cumprir a ODbL sem abrir o resto.

## Fontes

- Objetos OSM: [r9303518 Recreio](https://www.openstreetmap.org/relation/9303518), [r9303527 Santa Maria v1](https://www.openstreetmap.org/relation/9303527/history/1), [w303100482 Av. Sebastião Amoretti](https://www.openstreetmap.org/way/303100482), [w837880926](https://www.openstreetmap.org/way/837880926)
- [Wiki: 2024 Rio Grande do Sul Floods](https://wiki.openstreetmap.org/wiki/2024_Rio_Grande_do_Sul_Floods) e [Pt:Enchentes Rio Grande do Sul 2024](https://wiki.openstreetmap.org/wiki/Pt:Enchentes_Rio_Grande_do_Sul_2024)
- [Diário smaprs (importação PMPA Porto Alegre)](https://www.openstreetmap.org/user/smaprs/diary), [Pt:Import/Catalogue/Brazil PMPA Buildings Import](https://wiki.openstreetmap.org/wiki/Pt:Import/Catalogue/Brazil_PMPA_Buildings_Import)
- [OSMF Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), [Licence and Legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ), [Produced Work – Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline)
- [osm2pgsql.org](https://osm2pgsql.org/) (2.3.1, 05/07/2026)
- [Google Open Buildings](https://sites.research.google/gr/open-buildings/) (v3, imagens de mai/2023, CC BY 4.0 ou ODbL)
- Geofabrik: https://download.geofabrik.de/south-america/brazil/sul.html (não acessível desta sessão; caminho padrão do serviço)
