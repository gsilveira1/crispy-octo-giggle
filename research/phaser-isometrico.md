# Como fazer um mundo isométrico grande no Phaser 4?

Pesquisa para a issue #4 (filha do mapa #1, MVP do centro de Taquara). Data: 2026-11-24.

Versões consultadas:
- **Phaser 4.2.1** (npm, publicado em 2026-07-09). A linha 4.x estável começou com a 4.0.0 em 2026-04-10, depois vieram a 4.1.0 (2026-04-30) e a 4.2.0 (2026-06-19). Datas tiradas de `npm view phaser time`.
- **Tiled 1.12.2** (2026-05-27) — <https://mapeditor.org/2026/05/27/tiled-1-12-2-released.html>
- **OSM2World 0.4.0** (2025-01-21) — <https://wiki.openstreetmap.org/wiki/OSM2World>

As afirmações sobre o Phaser vêm do **código-fonte do pacote npm `phaser@4.2.1`** (`src/`, `skills/`, `changelog/`). Esse código é a fonte primária. Os caminhos abaixo são relativos ao pacote, que pode ser consultado em <https://unpkg.com/phaser@4.2.1/>.

---

## 1. Suporte nativo a tilemaps isométricos

- O Phaser 4 tem tilemaps **ortogonais, isométricos, hexagonais e staggered**. A orientação vem do JSON do Tiled (`orientation`), e o motor escolhe sozinho as funções de conversão de coordenadas (`IsometricTileToWorldXY`, `IsometricWorldToTileXY`). Fontes: `skills/tilemaps/SKILL.md` e `src/tilemaps/components/`.
- A API inclui `layer.getIsoTileAtWorldXY(x, y)`, `tileToWorldXY`/`worldToTileXY` e `map.setRenderOrder('right-down' | 'left-down' | 'right-up' | 'left-up')` (`src/tilemaps/Tilemap.js`). Ao converter objetos do Tiled em sprites, o `Tilemap` já aplica a projeção iso (`Tilemap.js`, por volta da linha 892).
- **O `TilemapGPULayer`, a camada nova da v4 que desenha a layer inteira num único quad via shader, só aceita mapas ortogonais.** Ele não funciona com iso, hex ou staggered, e aceita um tileset por layer. Fontes: `skills/tilemaps/SKILL.md`, seção "Gotchas" item 5, e o comentário em `src/tilemaps/TilemapGPULayer.js`. **Num mapa isométrico, só resta o `TilemapLayer` comum, renderizado pela CPU.**
- Mapas **infinitos (em chunks) do Tiled** são lidos, mas o parser **junta todos os chunks numa única grade densa** (`src/tilemaps/parsers/tiled/ParseTileLayers.js`, ramo `infiniteMap`). Os chunks do Tiled só ajudam na edição. No runtime não há streaming.
- Tilesets do tipo "Collection of Images" não são suportados. Cada tileset precisa ser uma imagem única e vir embutido no JSON (`skills/tilemaps/SKILL.md`, gotcha 7).

## 2. Ordenação de profundidade (prédios × personagens)

- O Phaser **não faz ordenação isométrica automática**. A `DisplayList` ordena os objetos por `depth` com um *stable sort* (`src/gameobjects/DisplayList.js`, `depthSort`/`sortByDepth`). O padrão é chamar `sprite.setDepth(y_do_pé)` a cada frame para os objetos que se movem.
- **Um `TilemapLayer` é um único Game Object.** Todos os tiles dele ficam na mesma profundidade, então um personagem não pode passar "entre" tiles de uma mesma layer. Por isso as paredes e os prédios **não podem** ficar numa tile layer se o jogador precisa andar na frente e atrás deles. Eles precisam ser **sprites (ou objetos) individuais com depth próprio**.
- A ordenação por Y funciona para objetos com uma pegada de 1×1 tile. **Prédios grandes ou com pegada irregular quebram a ordenação por Y**: o personagem aparece por cima do prédio ou atrás dele quando não deveria. Há duas soluções comuns:
  1. **Fatiar** cada prédio em colunas verticais de 1 tile de largura, cada fatia com o depth da sua base (é o padrão usado em jogos iso clássicos).
  2. Fazer uma **ordenação topológica** pela caixa da pegada no plano do chão (comparar intervalos em x/y no espaço do mundo, e não na tela).
  Para o MVP sem combate, a opção 1 é a mais simples e previsível.
- Usar as `Layer`s do Phaser (`src/gameobjects/layer`) para separar chão (sem sort), "mundo" (prédios + personagens + árvores, ordenados por depth) e UI. Isso limita o custo do sort ao grupo que precisa dele.

## 3. Desempenho com uma cidade inteira (chunks/culling)

- **Achado importante:** o culling isométrico do `TilemapLayer` **percorre todos os tiles da layer a cada frame**. `IsometricCullTiles.js` faz um loop `for y in 0..height, for x in 0..width` e chama `CheckIsoBounds` em cada tile, ou seja, cada tile passa por uma conversão `tileToWorldXY` (`src/tilemaps/components/IsometricCullTiles.js` e `CheckIsoBounds.js`). O culling ortogonal (`CullTiles.js`) é diferente: ele calcula um retângulo de tiles visíveis com `CullBounds` e só itera ali. **O custo do iso é O(largura × altura) por layer e por frame, não importa o zoom.**
  - Exemplo: 2 km × 2 km de centro urbano com tiles de 2 m dá 1000×1000 = 1 M de tiles. Isso significa 1 M de chamadas por layer por frame, o que é inviável a 60 fps.
- **Recomendação:** **dividir o mundo em chunks** de, por exemplo, 32×32 ou 64×64 tiles. Cada chunk vira o seu próprio `Tilemap`/`TilemapLayer` posicionado no mundo. Um gerenciador simples cria e destrói chunks conforme a câmera se move, num raio de 1 a 2 chunks além da tela. Com isso, cada layer viva custa no máximo 4 096 checagens e só há cerca de 9 a 16 chunks vivos ao mesmo tempo. Como alternativa, dá para calcular o retângulo visível em coordenadas de tile e usar `layer.skipCull = true` com uma layer pequena.
- Para objetos estáticos em massa (árvores, postes, decoração), o **`SpriteGPULayer`** (novo na v4) desenha até milhões de quads numa única draw call, mas tem restrições (`skills/v4-new-features/SKILL.md`):
  - aceita uma textura por layer;
  - atualizar o buffer é caro;
  - **todos os membros ficam com um único depth**, então ele só serve para coisas que nunca ficam na frente do jogador, como a decoração do chão.
- O **`Mesh2D`** (novo na **4.2.0**, `changelog/v4/4.2/CHANGELOG-v4.2.0.md`) desenha triângulos texturizados e faz batch junto com os sprites. É útil para desenhar o chão a partir de polígonos vetoriais (ver seção 5). Atenção: o `Mesh` e o `Plane` da v3 foram **removidos** na v4 (`skills/v3-to-v4-migration/SKILL.md`, §17).
- Com ~200 jogadores, o cliente só precisa renderizar os jogadores que estão perto. O *interest management* (filtro por área) fica a cargo do servidor (issue do Colyseus). No cliente, o gargalo é o mapa, não os avatares.

## 4. Ferramentas de autoria

- O **Tiled 1.12.x** tem suporte maduro a mapas isométricos e mapas infinitos, além de scripting em JS (a 1.12 trouxe `TileMap.chunkSize` e propriedades em lista) e uma nova orientação "oblique". Fonte: <https://www.mapeditor.org/2026/03/13/tiled-1-12-released.html>. O formato JSON do Tiled é o que o loader `this.load.tilemapTiledJSON` lê.
- Uma cidade inteira desenhada à mão no Tiled não escala, e o mapa precisa vir do OSM. **Use o formato JSON do Tiled como formato de saída de um pipeline gerado** (é simples de escrever) e use o Tiled só para **inspecionar e retocar** chunks específicos, como a praça central e pontos de interesse.
- O **Phaser Editor** (pago, da Phaser Studio) existe, mas é focado em cenas e prefabs. Não resolve a geração a partir do OSM.

## 5. Converter vetores do OSM (ruas, contornos de prédios) em mapa isométrico

Um ponto ajuda muito aqui: **a projeção isométrica (dimétrica 2:1) é uma transformação afim do plano.** Qualquer geometria em metros (por exemplo em UTM 22S / EPSG:31982, um CRS métrico que cobre Taquara) vira coordenadas de tela por `sx = (x − y)·k`, `sy = (x + y)·k/2`. O problema real não é a projeção, e sim **o estilo (tiles × arte livre) e a ordenação de profundidade**.

| Abordagem | Como | Prós | Contras |
|---|---|---|---|
| **A. Rasterizar em grade de tiles** | Projetar para UTM, rasterizar ruas, calçadas, grama e água numa grade de N m por célula (PostGIS `ST_AsRaster`/`ST_Intersects` por célula, ou Python com shapely/rasterio). Escolher a variante do tile com autotiling (terrain/Wang sets do Tiled). Exportar JSON do Tiled por chunk. | Fica com cara de "jogo". Tiles prontos de asset packs funcionam. Colisão e pathfinding por grade saem quase de graça. | As ruas do OSM não seguem os eixos, então ruas diagonais viram serrilhado. Exige tiles de transição (autotile). Usa o `TilemapLayer` iso, que exige o chunking da seção 3. |
| **B. Chão vetorial com `Mesh2D`** | Triangular os polígonos (earcut), aplicar a transformação iso e desenhar com `Mesh2D` usando texturas repetidas (asfalto, grama). Linhas de rua viram buffers de polígono (`ST_Buffer` pela largura estimada a partir de `highway=*`/`lanes`). | Mantém a geometria real da cidade. Não há serrilhado. Pode ser feito por chunk. | É mais código próprio. O `Mesh2D` é recente (4.2.0). As bordas e transições exigem shader ou textura. |
| **C. Pré-renderizar imagens** | Renderizar o chão (e até os prédios) como PNG em vista ortográfica iso. Opções: **OSM2World** (`--oview.angle`/`--oview.from`/`--oview.tiles`, LGPL), **Map Machine** (`--buildings isometric`, que usa `building:levels`/`height`, saída em SVG/PNG por tiles, MIT), ou Blender + Blosm. Recortar em imagens de chunk. | É o caminho mais rápido para um visual bonito, e a altura dos prédios vem do OSM. | Uma imagem não tem profundidade: os prédios precisam ser recortados à parte para o personagem passar atrás deles. É pesado em banda. Fica dependente do estilo dessas ferramentas. |
| **D. Prédios procedurais como sprites** | Simplificar a pegada (`ST_SimplifyPreserveTopology`, retangularizar ou alinhar à grade), extrudar com altura = `building:levels × ~3 m` (com fallback por tipo) e desenhar as paredes e o telhado em `Graphics`/`RenderTexture` ou num atlas gerado offline. Fatiar em colunas para o depth sort (seção 2). | Os prédios saem de dados reais e o depth fica correto. Combina com A, B ou C para o chão. | O visual é mais "low-poly". Paredes não ortogonais à grade iso são mais complexas de desenhar. |

**Recomendação para o MVP (centro de Taquara):**
1. Fazer um pipeline offline em Node/Python que lê o PostGIS e projeta em EPSG:31982.
2. **Chão:** começar pela **A** (grade de tiles + autotile, com saída em chunks de 64×64 no formato JSON do Tiled), ou pela **B** se o serrilhado das ruas diagonais incomodar no teste. A A é mais simples e dá colisão e pathfinding prontos.
3. **Prédios:** usar a **D** (sprites gerados a partir das pegadas, fatiados por coluna, com `setDepth` pela base). Não colocar os prédios em tile layers.
4. **Runtime:** um gerenciador de chunks (cada um com `TilemapLayer` iso + sprites de prédios) mais uma `Layer` "mundo" ordenada por depth. Não depender do culling iso nativo numa layer gigante.
5. Usar a **C** (OSM2World/Map Machine) só como protótipo visual rápido ou para gerar a arte dos prédios, não como mapa jogável.

## Riscos / fatos que afetam outras decisões

- **O `TilemapGPULayer` não serve para iso.** O caminho de alto desempenho da v4 vale só para mapas ortogonais. Se o desempenho do mapa iso virar problema, uma alternativa barata é ter a **lógica em grade ortogonal (top-down) e projetar só na renderização** (sprites e `Mesh2D`), sem usar o tilemap iso do Phaser.
- O **culling iso nativo é O(W×H) por frame**, então o chunking é obrigatório para uma cidade.
- Os dados de altura no OSM (`building:levels`/`height`) costumam ser esparsos em cidades pequenas. Vale conferir a cobertura em Taquara (issue de OSM) e prever valores por tipo de prédio.
- Nada aqui torna o isométrico, o Colyseus ou o OSM uma escolha ruim. O custo extra é o pipeline de conversão e o gerenciador de chunks, que ficam por nossa conta.

## Fontes

- Pacote `phaser@4.2.1`: <https://unpkg.com/phaser@4.2.1/>. Arquivos: `src/tilemaps/components/IsometricCullTiles.js`, `CheckIsoBounds.js`, `CullTiles.js`, `src/tilemaps/TilemapGPULayer.js`, `src/tilemaps/parsers/tiled/ParseTileLayers.js`, `src/gameobjects/DisplayList.js`, `src/gameobjects/mesh2d/Mesh2D.js`, `skills/tilemaps/SKILL.md`, `skills/v4-new-features/SKILL.md`, `skills/v3-to-v4-migration/SKILL.md`, `changelog/v4/4.2/CHANGELOG-v4.2.0.md`
- Repositório: <https://github.com/phaserjs/phaser>
- Tiled 1.12: <https://www.mapeditor.org/2026/03/13/tiled-1-12-released.html>; 1.12.2: <https://mapeditor.org/2026/05/27/tiled-1-12-2-released.html>
- OSM2World: <https://wiki.openstreetmap.org/wiki/OSM2World>
- Map Machine: <https://github.com/mfbehrens99/map-machine>
- OSM 3D development: <https://wiki.openstreetmap.org/wiki/3D_development>
