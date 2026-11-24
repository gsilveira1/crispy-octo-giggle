# Uma sala Colyseus aguenta 200 jogadores com combate?

Pesquisa do ticket #19 (filho do mapa #1). Data: 2026-11-24. Complementa a [pesquisa sem combate (#7)](https://github.com/gsilveira1/crispy-octo-giggle/blob/research/colyseus-200/research/colyseus-200.md); versões, limites gerais, `StateView` e AOI por grade estão lá e não são repetidos aqui.

Escopo do MVP considerado: combate **PvE apenas dentro das zonas de névoa** (crias da Cerração controladas pelo servidor, ataques e habilidades); **refúgios são seguros**; **sem PvP**.

## Resposta curta

**Sim, uma sala continua viável para 200 jogadores**, desde que (1) os inimigos "durmam" quando não há jogador por perto, (2) o combate seja de ritmo RPG (alvo/clique, cooldowns), não de mira em tempo real, e (3) a visibilidade de inimigos use a mesma AOI (`StateView`) dos jogadores. O combate PvE acrescenta principalmente **CPU de IA dos inimigos** e **mais entidades na banda**, não um salto de ordem de grandeza. Estimativa própria: banda de saída de ~1 MB/s (sem combate, com AOI) para ~1,5-2,5 MB/s, e CPU de simulação ainda na casa de poucos ms por tick. **Não dividir névoa e refúgios em salas separadas no MVP**: a troca de sala em cada fronteira custa mais do que economiza. Dividir só se o loadtest mostrar tick acima do orçamento, e então por região geográfica.

## O que as fontes oficiais dizem (relevante para combate)

- **Loop de simulação:** padrão 16,6 ms (60 fps); `setSimulationInterval()` é o nome antigo de `setTimestep()` e ainda funciona. Para jogos com predição no cliente, usar `setFixedTimestep(step, tickRate)` ([Room API](https://docs.colyseus.io/room.md)).
- **`patchRate`:** padrão 50 ms (20/s) ([Room API](https://docs.colyseus.io/room.md)). É independente do tick de simulação.
- **Passo fixo e entradas (0.18):** `setFixedTimestep(step, tickRate, options?)`; exemplos oficiais usam **30 Hz**, com `subSteps` para física mais fina; buffer de entradas por cliente `bufferMaxSize` padrão 32 ([Server Input & Timestep](https://docs.colyseus.io/netcode/server-input)). A doc não recomenda tick por gênero.
- **Netcode 0.18:** predição para o próprio movimento, interpolação (`lerp`) para entidades remotas, `reckon` para projéteis controlados pelo servidor, e **lag compensation** (`allowRewindState`, `rewind.lastSeenBy`) para *hitscan contra outros jogadores* ([Netcode](https://docs.colyseus.io/netcode), [Lag Compensation](https://docs.colyseus.io/netcode/lag-compensation)). A doc não trata RPG/MMO; os demos são FPS, MOBA, RTS etc. Lag compensation guarda histórico por entidade (`maxRewindMs` padrão 500) e exige a API de entradas (`defineInput`).
- **`StateView`:** cada view adiciona um passo de codificação; campos compartilhados são codificados uma vez; uma view pode ser **reutilizada por vários clientes**; aviso: "Avoid relying on `StateView` for large datasets: it is not optimized for that yet." `view.subscribe(collection)` inclui elementos futuros ([State View](https://docs.colyseus.io/state/view)).
- **Streaming (`t.stream()`, experimental):** evita que uma coleção que ganha centenas de entradas num tick gere "one enormous patch"; cada cliente drena `maxPerTick` (padrão 32) por tick em ordem de prioridade por cliente; o exemplo oficial é justamente uma coleção de `Enemy`. A prioridade só funciona com `StateView`; custo da callback é por cliente × entrada pendente × tick ([Streaming](https://docs.colyseus.io/state/streaming)).
- **Proteção:** `maxMessagesPerSecond` desconecta quem exceder; `validate()` falho desconecta com código 4002; `broadcast(..., { except, afterNextPatch })` ([Room API](https://docs.colyseus.io/room.md)).
- Continua **não existindo benchmark oficial** de sala com N jogadores ou N NPCs (ver #7).

## Custo extra do combate PvE (estimativa própria, não benchmark)

Hipóteses: 200 jogadores; ~40% (80) na névoa ao mesmo tempo; até ~300 crias vivas no mapa, das quais ~100 "acordadas" (com jogador a menos de ~2 telas); cada jogador vê ~30 jogadores e ~20 inimigos na AOI; posição quantizada ~8 B por mudança.

### CPU (um núcleo, o da sala)

| Item | Custo por tick (20 Hz) | Observação |
|---|---|---|
| Movimento/colisão de 200 jogadores + grade espacial | < 1 ms | já avaliado em #7 |
| IA de ~100 inimigos acordados (máquina de estados, busca de alvo na grade, mover) | ~0,2-1 ms | inimigos dormindo custam ~0 |
| Pathfinding | picos | A* sob demanda e com limite de nós por tick; preferir perseguição direta + desvio simples ou flow field pequeno por zona |
| Resolução de ataques/habilidades (alcance, cooldown, dano) | desprezível | dezenas de eventos/s |
| Codificação de patches com 200 `StateView` | o item a medir | cresce com nº de views × entidades alteradas |

Orçamento: com tick de 50 ms, manter o tick todo (simulação + encode) abaixo de ~25 ms deixa folga para GC e picos. A estimativa fica bem abaixo disso; o risco real é pathfinding sem limite e IA rodando para inimigos longe de jogadores.

### Banda de saída

| Cenário | Por cliente | Total (200) |
|---|---|---|
| Sem combate, AOI ~30 jogadores, 20/s (de #7) | ~4,8 KB/s | ~1 MB/s |
| + ~20 inimigos visíveis em movimento, 20/s | +~3,2 KB/s | +~0,6 MB/s |
| + HP/estado de combate e eventos (dano, habilidade) | +~0,5-2 KB/s | +~0,1-0,4 MB/s |
| **Total com combate** | **~8-10 KB/s** | **~1,6-2 MB/s (~13-16 Mbit/s)** |

Pior caso: todos amontoados numa mesma frente de névoa com muitos inimigos; AOI não ajuda. Isso deve ser um cenário explícito do loadtest. Mesmo assim, ordem de grandeza de dezenas de Mbit/s, viável numa VPS.

Como reduzir: inimigos parados não geram patch; HP como inteiro pequeno (`uint16`/`uint8` em %); eventos de um frame (dano, efeito) via `client.send()` só para quem está na AOI ou campos `.patchOnly()`; `t.quantized()` para x/y.

## Taxa de atualização (tick) recomendada

- **Simulação: 20 Hz fixo** (`setFixedTimestep` a 20 Hz, ou `setTimestep(50)`). Combate de RPG com alvo/clique e cooldowns em décimos de segundo não precisa de 30-60 Hz. Se o movimento do jogador usar predição com física, 30 Hz como nos exemplos oficiais também cabe no orçamento.
- **`patchRate`: 50 ms (padrão)** na névoa. Os 66-100 ms sugeridos em #7 para "sem combate" ficam apertados para feedback de golpe; 50 ms + interpolação no Phaser é o equilíbrio.
- **IA dos inimigos:** decisão (escolher alvo, trocar estado) a 5-10 Hz, movimento a cada tick; inimigos dormindo = 0 Hz.
- **Sem lag compensation** no MVP: ela foi feita para mira/hitscan contra jogadores em movimento; em PvE com alvo travado e alcance de ataque com pequena tolerância (ex.: +0,5 tile) o servidor valida no estado atual. Reavaliar se houver PvP ou projéteis com mira.
- **Predição só para o próprio movimento**; ataques são pedidos (`attack {targetId, skillId}`) validados pelo servidor (alcance, cooldown, linha de visão simples, alvo vivo, jogador fora de refúgio). Animação de golpe pode começar no cliente de forma otimista; dano e morte vêm do servidor.

## Dividir névoa e refúgios em salas separadas?

**Recomendação: não no MVP; uma sala por cidade, com "zona" como dado do estado.**

Contra dividir por tipo de zona (névoa x refúgio):
- No mapa real de Taquara as fronteiras névoa/refúgio são muitas e atravessadas o tempo todo; cada travessia seria troca de sala (reserva de assento + reconexão + resync), com "piscada" e risco de exploit (fugir para o refúgio no meio do combate e o inimigo sumir).
- Jogadores na borda não se veem entre salas sem lógica de "fantasmas" e pub/sub entre salas (ver #7).
- O ganho é pequeno: os refúgios quase não custam CPU (sem IA, sem combate), então separar não alivia a sala da névoa de forma relevante.

Como tratar dentro de uma sala:
- Cada célula/polígono tem `zoneType` (refúgio/névoa), pré-calculado do mapa. O servidor recusa ataques de/para quem está em refúgio; inimigos não entram em refúgio (leash/retorno ao spawn).
- Inimigos pertencem a "spawners" por zona de névoa; um spawner sem jogador por perto adormece todos os seus inimigos e para de reabastecer.

Quando dividir (gatilhos do loadtest):
- Tick médio acima de ~25 ms ou p99 acima de 50 ms; processo da sala perto de 100% de um núcleo.
- Mais jogadores ou mais cidades. A divisão natural é **geográfica** (bairro/região ou cidade), cada sala contendo refúgios e névoa.
- Exceção: se o design tiver **névoas instanciadas** (área fechada entrada por um portal, tipo masmorra, com grupo pequeno), essas sim são ótimas candidatas a salas próprias, criadas sob demanda; o padrão do Colyseus de salas sob demanda encaixa bem.

## Plano de validação (antes do lançamento)

`@colyseus/loadtest` em outra máquina, com bots que:
1. 300 bots andando aleatório, 40% na névoa atacando o inimigo mais próximo a cada 1 s.
2. "Frente única": 150 bots na mesma zona de névoa com 100 inimigos acordados.
3. Medir: duração do tick (média/p99), CPU do processo, RAM, bytes enviados/s, tempo de codificação de patch. Instrumentar o tick com `performance.now()` no servidor.

## Lacunas

- Nenhum benchmark oficial de NPCs/combate no Colyseus; todos os números acima são estimativa e dependem do design (densidade de crias, habilidades em área, projéteis).
- O custo real de `StateView` com 200 views e centenas de entidades não é documentado; é o primeiro número a medir.
- `t.stream()` é experimental; útil se houver ondas de spawn (dezenas de inimigos surgindo no mesmo tick), mas fixe a versão do `@colyseus/schema` se usar.
- A doc de netcode 0.18 não fala de RPG/MMO; a escolha de 20 Hz sem lag compensation é inferência a partir do ritmo do combate, não recomendação oficial.
