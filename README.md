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
  map-pipeline/  converte o OpenStreetMap em mapas de cidade
  tsconfig/ configuração base do TypeScript
data/cities/     uma pasta por cidade (veja data/cities/README.md)
docs/decisions/  registros de decisões de arquitetura
```

## Comandos

```bash
pnpm install
pnpm typecheck
pnpm dev
```

Requer Node 22+ e pnpm 10.

## Cidades

Para adicionar uma cidade nova a partir do OpenStreetMap, siga [data/cities/README.md](data/cities/README.md):

```bash
pnpm city new <id> --name "Nome" --bbox=oeste,sul,leste,norte
pnpm city fetch <id>
pnpm city build <id>
```

Mapas: © OpenStreetMap contributors (ODbL).
