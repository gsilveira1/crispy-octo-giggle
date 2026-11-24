# Uma sala Colyseus aguenta 200 jogadores?

Pesquisa do ticket #7 (filho do mapa #1). Data: 2026-11-24.

## Resposta curta

**Sim, com folga, desde que o estado seja pequeno e a visibilidade seja filtrada por área (AOI).** 200 jogadores andando numa cidade sem combate é uma carga baixa para um único processo Node.js. O Colyseus não publica um limite por sala nem benchmarks oficiais por sala; o gargalo real será a **banda de saída** se cada cliente receber a posição de todos os 200, e não a CPU. Com `StateView` + grade espacial, a banda cai cerca de 5-10x. Dividir a cidade em várias salas só vale a pena acima de algumas centenas de jogadores numa mesma área, ou quando o mapa crescer para várias cidades.

## Versões atuais (npm, consultado em 2026-11-24)

| Pacote | `latest` | Publicado |
|---|---|---|
| `colyseus` | 0.18.12 | 2026-11-07 |
| `@colyseus/core` | 0.18.29 | 2026-11-18 |
| `@colyseus/schema` | 5.0.50 | 2026-11-19 |
| `@colyseus/loadtest` | 0.18.4 | 2026-10-22 |

A 0.18 saiu em 20/08/2026 ([blog](https://colyseus.io/blog/colyseus-018-is-here/)). A linha 0.17 ainda recebe correções (`legacy-0.17`). Vale começar já na 0.18 / Schema 5. Fonte: `https://registry.npmjs.org/<pacote>` (dist-tags e time).

## O que as fontes oficiais dizem sobre limites

- **Não há limite por sala.** `maxClients` tem padrão `Infinity`; a sala trava quando enche ([Room API](https://docs.colyseus.io/room.md)). O mantenedor (endel) confirma que dá para registrar uma sala única sem `maxClients` e que "there aren't benchmarks available yet to provide information about real limits"; o limite depende de quanto dado é sincronizado e do hardware ([fórum](https://discuss.colyseus.io/post/394)).
- **CCU por servidor:** "a small cloud server (1 vCPU, 1GB RAM) can typically handle 1,000-2,000 concurrent connections for simple games. For complex games with large state, expect fewer." Cada conexão usa ~2-5 KB de RAM, crescendo com o estado. Linux tem limite padrão de ~1024 descritores de arquivo (ajustar `ulimit`) ([FAQ](https://docs.colyseus.io/faq)).
- **Uma sala vive em um único processo** ("Each Room belongs to a single Colyseus process"): ela usa um único núcleo de CPU (event loop do Node). Escalar adicionando processos aumenta o número de *salas*, não o tamanho de uma sala ([Scalability](https://docs.colyseus.io/scalability)).
- **Taxas padrão:** `patchRate` = 50 ms (20 patches/s); loop de simulação padrão 16,6 ms (60 fps); `setFixedTimestep()` para passo fixo. `maxMessagesPerSecond` (padrão `Infinity`) desconecta clientes que mandam mensagens demais: útil como proteção num lançamento público ([Room API](https://docs.colyseus.io/room.md)).
- **Schema 5 (0.18):** encoder "about 2.4× faster than 4.0"; `t.quantized()` codifica floats em 8/16/32 bits; `.fullStateOnly()` manda dados só no join (ex.: layout do mapa); `.patchOnly()` para eventos de um frame; SDK do browser ~58 KB gzip ([blog 0.18](https://colyseus.io/blog/colyseus-018-is-here/)).

## Estimativa de carga (cálculo próprio, não benchmark)

Hipóteses: 200 jogadores, todos se movendo; cada mudança de posição ~8 bytes no fio (x,y quantizados em 16 bits + cabeçalho de referência/campo do Schema); 20 patches/s.

| Cenário | Por cliente | Total de saída do servidor |
|---|---|---|
| Sem filtro (todos veem todos) | 200 × 8 B × 20 = ~32 KB/s | ~6,4 MB/s (~51 Mbit/s) |
| AOI com ~30 vizinhos visíveis | ~4,8 KB/s | ~1 MB/s (~8 Mbit/s) |
| AOI + `patchRate` 100 ms (10/s) | ~2,4 KB/s | ~0,5 MB/s |

- Mesmo sem filtro, 50 Mbit/s é viável numa VPS, mas custa caro em tráfego, piora em clientes móveis, e o pior caso (todos amontoados na praça) não melhora com AOI. Isso deve ser testado com carga.
- **CPU:** mover 200 entidades, checar colisão com a grade de ruas e recalcular vizinhos numa grade espacial (hash de células) é trivial (bem abaixo de 1 ms por tick). O custo que cresce é a serialização: os campos compartilhados são codificados uma vez, mas **cada `StateView` adiciona um passo de codificação por cliente** ([State View](https://docs.colyseus.io/state/view)). Com 200 views a 20 Hz são 4.000 codificações por view/s, aceitável mas é o ponto a medir.
- O próprio doc de loadtest observa que 500 clientes a 20 patches/s geram 10.000 decodificações/s num núcleo do *gerador de carga* ([Load Testing](https://docs.colyseus.io/tools/loadtest)): rode o loadtest em outra máquina e em vários processos.

## Técnicas para mandar só o que está perto

1. **`StateView` (desde 0.16, substitui `@filter`/`@filterChildren`)** ([docs](https://docs.colyseus.io/state/view), [migração 0.16](https://docs.colyseus.io/upgrading/0.16)):
   - `client.view = new StateView()` no `onJoin`.
   - Marque a coleção de jogadores (ou campos) com `.view()` / `@view()`; só quem tem a instância na view recebe.
   - `view.add(player)` / `view.remove(player)` / `view.has(player)` a cada tick (ou quando o jogador muda de célula da grade) implementam a área de interesse.
   - Tags numéricas (`.view(1)`) dão nível de detalhe: ex. posição para todos na área, aparência/nome completo só para os mais próximos.
   - `view.subscribe(collection, prioridade?)` (0.18): assinatura contínua de uma coleção, inclui elementos futuros.
   - Aviso oficial: "Avoid relying on `StateView` for large datasets: it is not optimized for that yet." 200 jogadores não é "large dataset", mas não use StateView para milhares de objetos estáticos do mapa.
2. **Streaming collections (`t.stream()`, 0.18, experimental)** ([docs](https://docs.colyseus.io/state/streaming)): envia coleções grandes em fatias por tick (`maxPerTick`, padrão 32 por cliente), na ordem de uma função de prioridade por cliente (ex.: mais perto primeiro). Indicado pela doc para "large worlds". Útil para NPCs/objetos dinâmicos numerosos; para 200 jogadores um `MapSchema` com `.view()` basta.
3. **Não sincronizar o mapa pelo estado:** geometria da cidade (OSM) vai como asset estático/tiles; no estado só entidades dinâmicas. Se algo precisar ir pelo estado, use `.fullStateOnly()`.
4. **Reduzir bytes:** `t.quantized()` para x/y, `t.angle()` (2 bytes) para direção, `patchRate` 66-100 ms com interpolação no cliente (sem combate não precisa de 20 Hz).
5. **Mensagens fora do estado:** chat local e emotes podem ir por `client.send()` só para os vizinhos calculados pela mesma grade espacial.

## Quando dividir a cidade em várias salas

O mantenedor recomenda dividir mapas enormes em salas menores ("the recommended way for dealing with huge maps") e o Colyseus distribui salas entre processos com Redis presence/driver ([fórum](https://discuss.colyseus.io/post/489), [Scalability](https://docs.colyseus.io/scalability)). O demo oficial de MMO usa uma sala por célula de grade, criada sob demanda, e o jogador troca de sala com reserva de assento; o próprio demo diz que não tem sharding nem balanceamento de carga ([MMO demo](https://docs.colyseus.io/demo/mmo/), versão 0.14).

Gatilhos para dividir:

- O loadtest mostra o processo da sala perto de 100% de um núcleo, ou o tick passando do orçamento (ex.: >25 ms com patch de 50 ms).
- Meta de jogadores acima de ~500-1000 na mesma cidade, ou mais de uma cidade (uma sala por cidade/bairro é a divisão natural).
- Banda de saída de um processo virando custo relevante mesmo com AOI.

Custos de dividir: transição entre salas (reconexão com reserva de assento, "piscada"), jogadores na fronteira não se veem sem lógica extra (sobreposição/ghosts), chat e presença precisam de Redis/pub-sub entre salas. Para o MVP (~200 CCU, um centro urbano), **uma sala `cidade:taquara` com AOI por grade é o desenho mais simples**; deixe o `roomId`/nome parametrizado por cidade para dividir depois.

## Recomendação para o MVP

1. Uma sala por cidade (Taquara), `maxClients` ~250-300 com fila/segunda instância como válvula.
2. Grade espacial no servidor (células de ~1-2 telas); `StateView` com `view.add/remove` ao trocar de célula (célula atual + 8 vizinhas).
3. Schema 5: posições quantizadas, `patchRate` 66-100 ms, interpolação no Phaser.
4. `maxMessagesPerSecond` e validação de movimento autoritativa (velocidade máxima, colisão com ruas).
5. Antes do lançamento: `@colyseus/loadtest` com 300 bots andando aleatoriamente e um cenário "todos na mesma praça", medindo CPU do processo e banda de saída.

## Lacunas

- Não há benchmark oficial de sala com N jogadores; os números acima são estimativa. Validar com loadtest é obrigatório.
- `t.stream()` é experimental e pode mudar.
- Custo exato de CPU por `StateView` não é documentado.
