# Big River MMORPG

MMORPG de browser com mapas reais das cidades do Rio Grande do Sul, começando por Taquara.

## Estrutura

```
apps/
  game/     cliente do jogo (browser)
  admin/    painel para criar e configurar cidades, NPCs, regras e história
  server/   servidor multiplayer
packages/
  shared/   modelos de dados compartilhados (schemas zod)
  tsconfig/ configuração base do TypeScript
docs/decisions/  registros de decisões de arquitetura
```

## Comandos

```bash
pnpm install
pnpm typecheck
pnpm dev
```

Requer Node 22+ e pnpm 10.
