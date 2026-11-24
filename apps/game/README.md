# @bigriver/game

Cliente do jogo no navegador (Phaser 4 + Vite).

```bash
pnpm install
pnpm --filter @bigriver/game dev      # http://localhost:5173
```

`?city=<id>` escolhe a cidade (padrão `taquara`).

## Como funciona

- **Mapa:** `public/maps/<id>/` vem de `pnpm city build <id>` (veja `data/cities/README.md`). `manifest.json` tem o tamanho da grade, o ponto de nascimento, os POIs e as ruas; `chunks/<cx>_<cy>.json` tem 64×64 tiles de chão e os prédios daquele pedaço.
- **Chunks:** `src/world/ChunkManager.ts` carrega os chunks em volta da câmera e descarrega os que saem de vista. O chão de cada chunk é um `Blitter` (um sprite por tile do mesmo tileset).
- **Prédios:** `src/world/buildings.ts` desenha cada prédio a partir do contorno real, com paredes extrudadas pela quantidade de andares e telhado plano. A profundidade é o ponto mais baixo da base na tela. Prédios que tapam o personagem ficam translúcidos.
- **Personagem:** `src/world/Player.ts` anda a 4 m/s (Shift corre), colide com prédios e água. Ainda é só local, sem servidor.
- **Assets:** `public/assets/` vem de `pnpm assets` (provisórios, veja `packages/assets/README.md`).

## Controles

WASD ou setas para andar, Shift para correr, roda do mouse para zoom, clique e segure para andar até o ponteiro (funciona no toque).

## Limitações conhecidas

- A ordenação de profundidade usa a base de cada prédio inteiro; em prédios grandes e irregulares o personagem pode aparecer na frente ou atrás errado. A solução prevista é fatiar prédios em colunas de 1 tile quando houver arte própria (issue #4).
- Sem multiplayer ainda: o próximo passo é a sala Colyseus por cidade.
