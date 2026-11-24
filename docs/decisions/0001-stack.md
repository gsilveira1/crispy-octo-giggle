# 0001. Stack do jogo (proposta, aguardando aprovação)

## Renderização do cliente

| Opção | O que é | Prós | Contras |
|---|---|---|---|
| **Phaser 4** | Engine 2D completa (WebGL) | Cenas, câmera, input, tilemaps, física arcade, loader e áudio prontos; maior comunidade de jogos 2D web; v4 estável desde 2026 | Menos controle fino que um renderer puro |
| PixiJS 8 | Só renderizador 2D (WebGL/WebGPU) | Muito rápido, leve, flexível | Câmera, input, colisão, cenas e tilemap ficam por nossa conta |
| Three.js | Renderizador 3D | Permite visual 3D/2.5D | Assets 3D caros, muito mais trabalho para um RPG top-down |
| MapLibre GL / deck.gl | Renderizadores de mapa | Desenham dados geográficos reais com perfeição | Não são engines de jogo: sem sprites, colisão nem loop de jogo |
| Excalibur.js | Engine 2D em TypeScript | API em TS bem feita | Comunidade e ecossistema bem menores |

**Recomendação: Phaser 4.** O jogo é um RPG top-down 2D, e Phaser entrega quase tudo que um RPG precisa. Os dados do OpenStreetMap viram tilemaps em pedaços (chunks) que o Phaser carrega conforme o jogador anda.

## Servidor multiplayer

**Recomendação: Colyseus (Node + TypeScript).** Salas com estado sincronizado automaticamente, matchmaking e reconexão prontos. Cada cidade (ou bairro, conforme crescer) é uma sala. O servidor é autoritativo: o cliente só envia intenções (mover, atacar) e o servidor valida.

Alternativas consideradas: Socket.IO ou uWebSockets puro (mais trabalho para sincronizar estado), Nakama (servidor em Go, extensões em TS limitadas).

Persistência: **PostgreSQL + PostGIS** (consultas geográficas: NPCs perto do jogador, bairro onde ele está) com **Drizzle ORM**. Redis entra depois, quando houver mais de um processo de servidor.

## Painel admin

**React + Vite**, com **MapLibre GL** para editar mapas (posicionar NPCs, desenhar zonas sobre o mapa real). Formulários validados pelos mesmos schemas zod de `packages/shared`. A API do admin roda no próprio `apps/server` no início.

## Monorepo

**pnpm workspaces + Turborepo.** pnpm é rápido e rígido com dependências; Turborepo faz cache de build e roda tarefas na ordem certa. Nx foi considerado e descartado por ser mais pesado do que o projeto precisa agora.

## Pipeline de mapas (passo 3, depois da aprovação)

OSM (Overpass ou extrato da Geofabrik) → GeoJSON → projeção em metros (SIRGAS 2000 / UTM 22S, EPSG:31982) → rasterização em tilemaps por chunk (ruas, bairros, rios, rodovias, colisão) → arquivos estáticos consumidos pelo Phaser e pelo servidor.
