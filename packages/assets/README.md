# @bigriver/assets

Gera os **assets provisórios** do jogo em `apps/game/public/assets/`:

| Arquivo | Conteúdo |
|---|---|
| `ground.png` | Tileset do chão: um losango 64×32 por tipo de chão, na ordem de `GROUND_TYPES` (`packages/shared/src/tiles.ts`) |
| `avatar.png` | Personagem 32×48, 3 frames (parado, passo 1, passo 2), pé no centro da base |
| `assets.json` | Tamanhos, ordem dos frames e cores dos prédios por tipo |

```bash
pnpm assets
```

## Trocar pela arte final

O contrato está em [`src/spec.ts`](src/spec.ts). Para trocar um asset provisório pela arte própria:

1. Desenhe mantendo o mesmo tamanho de frame e a mesma ordem.
2. Salve o PNG no lugar do gerado em `apps/game/public/assets/`.
3. Se for adicionar tipos de chão, acrescente em `GROUND_TYPES` (no fim, para não mudar os índices) e rode `pnpm city build <cidade>` de novo.

Os prédios ainda são desenhados pelo cliente a partir do contorno (paredes extrudadas e telhado plano), usando as cores de `BUILDING_PALETTE`. Quando houver arte de prédios, eles passam a ser sprites fatiados em colunas de 1 tile (veja o issue #4).
