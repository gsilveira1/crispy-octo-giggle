# @bigriver/game

Cliente do jogo no navegador: **3D em Three.js** + Vite (decisão em `docs/decisions/0002-cliente-3d.md`).

```bash
pnpm install
pnpm --filter @bigriver/game dev      # http://localhost:5173 (3D)
                                      # http://localhost:5173/2d.html (cliente isométrico antigo, Phaser)
```

`?city=<id>` escolhe a cidade (padrão `taquara`).

## Como funciona (3D, `src3d/`)

- **Escala:** 1 unidade do Three.js = 1 metro de jogo. O tile (coluna, linha) fica em `x = coluna × metersPerTile`, `z = linha × metersPerTile`; norte é −z.
- **Mapa:** o mesmo `public/maps/<id>/` gerado por `pnpm city build <id>` (veja `data/cities/README.md`).
- **Chunks** (`world/chunks.ts`): carrega os chunks num raio de 110 m em volta do jogador e descarrega o resto.
- **Chão** (`world/ground.ts`): uma textura desenhada em canvas por chunk, com placas de concreto, meio-fio, faixa amarela no eixo das ruas com nome e sujeira. O asfalto tem rugosidade baixa para parecer molhado.
- **Prédios** (`world/buildings.ts`): paredes extrudadas do contorno real (`levels × 2,8 m`), janelas com uma parte acesa e telhado plano. Todos os prédios de um chunk viram dois meshes. Um recorte pontilhado abre um buraco no que estiver entre a câmera e o jogador.
- **Objetos** (`world/props.ts`): espalhados de forma determinística (o mesmo tile gera sempre o mesmo objeto): postes junto à rua, carros abandonados, barreiras, caixas e barris perto dos prédios, árvores em praças e matas. Bloqueiam a passagem.
- **Luz:** noite com lua fria (única luz com sombra), 8 luzes de poste reais que acompanham o jogador, poças de luz pintadas nos demais postes, lampião do personagem, névoa (`FogExp2`) e bloom.
- **Personagem** (`world/player.ts`): provisório em low-poly (poncho, chapéu e lampião), 4 m/s, Shift corre.

## Controles

WASD ou setas para andar (relativo à câmera), Shift para correr, Q/E giram a câmera 45°, roda do mouse para zoom, clique e segure para andar até o ponteiro (funciona no toque).

## Limitações conhecidas

- Personagem, carros e objetos são provisórios, feitos de primitivas. A arte final entra como glTF (issue #15).
- Sem multiplayer ainda: o próximo passo é a sala Colyseus por cidade.
- Sem modo leve para celular fraco (desligar sombras e bloom).
