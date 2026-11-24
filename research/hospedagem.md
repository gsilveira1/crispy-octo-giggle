# Onde hospedar o MVP?

Issue: #11 · Mapa: #1 · Pesquisa feita em 2026-11-24. Preços em USD/EUR por mês, sem impostos, conforme as páginas oficiais nessa data.

## Resumo

- **O que mais pesa é a latência.** Os jogadores estão no RS (Taquara). Um servidor em **São Paulo** fica a uns 20–35 ms de RTT. Na Virgínia (EUA) fica a uns 120–150 ms e na Europa a mais de 200 ms. Essas faixas são estimativas pela distância geográfica e precisam ser medidas. Para um MMO sem combate, 150 ms é jogável, mas a sensação de "andar com atraso" fica visível. Então só entram na lista principal os provedores **com região em São Paulo**.
- **Recomendação (MVP, cerca de 200 CCU):**
  1. **Servidor de jogo (Colyseus):** uma VM em São Paulo. Pode ser **Vultr** (VPS próprio com Docker) ou **Fly.io `gru`**, se o time preferir PaaS e deploy por `fly deploy`.
  2. **Postgres + PostGIS:** **Neon em `aws-sa-east-1`** (gerenciado, barato com pouca carga, tem PostGIS) ou **Supabase Pro em `sa-east-1`**. A alternativa mais barata é rodar Postgres+PostGIS no mesmo VPS, mas aí backup e upgrade ficam por conta do time.
  3. **Cliente e admin estáticos:** **Cloudflare Pages** (CDN com 31 PoPs no Brasil, plano grátis).
- **Custo estimado:** **US$ 10–35/mês** no caminho VPS em São Paulo, ou **US$ 35–60/mês** no caminho Fly + Neon/Supabase. Detalhes na tabela abaixo.
- **Fora da lista principal:** Hetzner e Railway não têm região na América do Sul. Colyseus Cloud não publica a lista de regiões.

## Premissas de carga

- **CCU:** 200 jogadores simultâneos e nenhum combate. As mensagens são basicamente movimento e chat. Um único processo Node/Colyseus em 1–2 vCPU deve aguentar isso, mas **é preciso fazer teste de carga**. O próprio FAQ da Colyseus Cloud diz que a capacidade depende do código e recomenda testar ([colyseus.io/cloud-managed-hosting](https://colyseus.io/cloud-managed-hosting)).
- **Tráfego de saída:** estimativa grosseira de 2–5 KB/s por jogador em patches de estado. Com 200 CCU no pico, isso dá 0,4–1 MB/s. Supondo cerca de 4 h de pico por dia, o total fica entre **~150 GB e 500 GB/mês**. Os tiles e assets estáticos saem da CDN, não do servidor de jogo.
- **Banco:** o volume é pequeno (centro de Taquara, contas, inventário). Dá para começar com 1–2 GB de RAM.

## Comparação

### Servidor de jogo (processo longo com WebSocket)

| Opção | Região BR? | Custo (≈200 CCU) | Operação | Observações |
|---|---|---|---|---|
| **Vultr** Regular Performance | **Sim**, São Paulo (também Santiago e Cidade do México) | 1 vCPU/2 GB: **US$ 10** (2 TB de tráfego incluído). 2 vCPU/4 GB: **US$ 20**. Excedente a US$ 0,01/GB | Média: o time cuida de VPS, Docker, TLS (Caddy) e atualizações | O site não mostra preço diferente para São Paulo. 33 regiões. [Preços](https://www.vultr.com/pricing/), [Regular Performance](https://www.vultr.com/products/regular-performance-compute/) |
| **Fly.io** Machines | **Sim**, `gru` | Fator de **1,615×** sobre o preço de Ashburn. shared-cpu-1x 1 GB: US$ 6,70 em iad, ≈ **US$ 10,80** em gru. shared-cpu-2x 2 GB: US$ 13,39 em iad, ≈ **US$ 21,60** em gru. Saída para a América do Sul: **US$ 0,04/GB**, ou seja, ≈ US$ 6–20 para 150–500 GB | Baixa: deploy com Dockerfile, TLS e anycast prontos | Não há free tier contínuo para organizações novas. IPv4 dedicado custa US$ 2. Faltam sticky sessions e health check de WebSocket. [Preços](https://fly.io/pricing.md), [docs de preço](https://docs.fly.io/about/pricing) |
| **Akamai (Linode)** | **Sim**, `br-gru` | Preço não confirmado (a página regional manda para outra tabela) | Média, como VPS | Alternativa à Vultr. [Akamai São Paulo](https://www.akamai.com/cloud/pricing/sao-paulo) |
| **Colyseus Cloud** | **Não confirmado.** A página fala em "32 locations", mas não lista quais | **A partir de US$ 15/mês**, sem limite de CCU e com banda ilimitada | Muito baixa: feito para Colyseus (NGINX + PM2, SSL, deploy por GitHub) | Os nomes dos planos ("High Frequency", "High Performance"…) e o número de locais batem com a Vultr. **Isso é inferência**: é provável que haja São Paulo, mas precisa confirmar no painel. Não oferece Postgres, então o banco fica em outro lugar. [Preços](https://colyseus.io/pricing), [Planos](https://docs.colyseus.io/cloud/compute-plans), [Cobrança](https://docs.colyseus.io/cloud/pricing-billing) |
| **Railway** | **Não**. Regiões: US West, US East (Virgínia), EU West (Amsterdã) e Singapura | Hobby US$ 5 ou Pro US$ 20, mais uso (≈US$ 20/vCPU e ≈US$ 10/GB de RAM por mês). Saída a US$ 0,05/GB | Baixa | A melhor região seria a Virgínia, com ~130 ms. [Regiões](https://docs.railway.com/deployments/regions.md), [Preços](https://railway.com/pricing.md) |
| **Hetzner Cloud** | **Não**. Locais: Falkenstein, Nuremberg, Helsinki, Ashburn, Hillsboro e Singapura | CX23 (2 vCPU/4 GB) por **€ 5,99**. O mais barato por recurso | Média, como VPS | Com 120–200+ ms para o RS, não serve como host principal. [Cost-optimized](https://www.hetzner.com/cloud/cost-optimized) |

### Postgres + PostGIS

| Opção | Região BR? | Custo | PostGIS | Observações |
|---|---|---|---|---|
| **Neon** | **Sim**, `aws-sa-east-1` (GA em 2025-02) | Plano Launch sem mínimo: US$ 0,106/CU-h e US$ 0,35/GB-mês. Carga intermitente sai ≈ **US$ 15/mês**. Ligado 24/7 com 0,25–0,5 CU: ≈ US$ 20–40 | Sim (extensão suportada) | Escala até zero depois de 5 min. Dá para desligar isso no Launch e evitar cold start durante o jogo. [Preços](https://neon.com/pricing), [Regiões](https://neon.com/docs/introduction/regions) |
| **Supabase** | **Sim**, `sa-east-1` | Pro **US$ 25/mês**, já com US$ 10 de crédito que cobre a instância Micro (1 GB). Small (2 GB) custa US$ 15. 250 GB de saída incluídos | Sim | No Free, o projeto pausa depois de 1 semana sem atividade, então não serve para produção. [Preços](https://supabase.com/pricing) |
| **Fly Managed Postgres** | Precisa confirmar se `gru` está disponível (`fly platform regions`) | Basic (1 GB) por **US$ 38**, mais US$ 0,28/GB | Sim, ativado na criação | [Docs MPG](https://docs.fly.io/postgres.md) |
| **Vultr Managed PostgreSQL** | Sim, São Paulo | A partir de **US$ 90/mês** (4 GB) | Não verificado | Caro para o MVP. [Preços](https://www.vultr.com/pricing/) |
| **Postgres no mesmo VPS** (imagem `postgis/postgis`) | Igual ao VPS | **US$ 0** extra | Sim | Exige backup próprio (pg_dump ou WAL-G para object storage) e monitoramento. Risco de operação maior. |

### Cliente e admin estáticos

- **Cloudflare Pages:** plano grátis com banda sem limite e CDN com PoPs em várias cidades do Brasil (31 data centers no BR, segundo [getdeploying](https://getdeploying.com/datacenters-in-brazil)). Também serve os tiles vetoriais (PMTiles) se for o caso. Outras opções são Vercel (região `gru1`) e Netlify.

## Cenários de custo mensal (200 CCU)

| Cenário | Componentes | Custo aproximado | Operação |
|---|---|---|---|
| **A. Tudo em um VPS em SP** | Vultr 2 vCPU/4 GB (US$ 20) com Colyseus e Postgres/PostGIS em Docker, Cloudflare Pages (US$ 0) e backup em object storage (~US$ 5) | **~US$ 25** | Mais alta |
| **B. VPS em SP + banco gerenciado** | Vultr 1 vCPU/2 GB (US$ 10), Neon Launch sa-east-1 (~US$ 15–30) e Cloudflare Pages | **~US$ 25–40** | Média |
| **C. PaaS** | Fly `gru` shared-cpu-2x 2 GB (~US$ 22) com saída de ~US$ 6–20, Neon sa-east-1 ou Supabase Pro (US$ 15–25) e Cloudflare Pages | **~US$ 45–65** | Baixa |
| **D. Colyseus Cloud** (se tiver SP) | A partir de US$ 15, mais Neon/Supabase | **~US$ 30–45** | Muito baixa no servidor de jogo |

## Recomendação

1. **Para o MVP, ir com o cenário B:** Colyseus em um VPS em São Paulo (Vultr), Postgres+PostGIS no Neon `aws-sa-east-1` (com scale-to-zero desligado) e cliente/admin no Cloudflare Pages. O custo é baixo, a latência é a melhor possível e o banco tem backup e PITR gerenciados.
2. **Se o time não quiser cuidar de VM,** troque o VPS pelo **Fly.io `gru`** (cenário C). O jogo e o banco continuam em São Paulo.
3. **Antes de decidir, conferir no painel da Colyseus Cloud** se existe região em São Paulo. Se existir, o cenário D tira a parte de operação do servidor de jogo pelo preço de um VPS.
4. **Evitar Hetzner e Railway como host principal** enquanto não tiverem região na América do Sul.

## Pontos que afetam outras decisões

- **Escalar o Colyseus em várias máquinas** precisa de Redis (presence/driver) e de rotear cada cliente sempre para o mesmo processo. Com 200 CCU, **um processo só basta**. Não vale planejar escala horizontal para o MVP.
- **Neon e Supabase com pooler:** use a conexão direta (ou session mode) para as migrations do Drizzle, e o pooler só para consultas curtas.
- **Nada aqui inviabiliza a stack** (Phaser 4 + Colyseus + PostGIS). Todos os provedores listados rodam Node e WebSocket de longa duração, exceto as plataformas serverless (Vercel, Netlify, Cloudflare Workers), que só atendem o front.

## Fontes

- Fly.io: https://fly.io/pricing.md · https://docs.fly.io/about/pricing · https://docs.fly.io/postgres.md
- Vultr: https://www.vultr.com/pricing/ · https://www.vultr.com/products/regular-performance-compute/
- Hetzner: https://www.hetzner.com/cloud/cost-optimized
- Railway: https://railway.com/pricing.md · https://docs.railway.com/deployments/regions.md
- Colyseus Cloud: https://colyseus.io/pricing · https://colyseus.io/cloud-managed-hosting · https://docs.colyseus.io/cloud/compute-plans · https://docs.colyseus.io/cloud/pricing-billing
- Neon: https://neon.com/pricing · https://neon.com/docs/introduction/regions · https://neon.com/docs/changelog/2025-02-28
- Supabase: https://supabase.com/pricing
- Akamai: https://www.akamai.com/cloud/pricing/sao-paulo
- Data centers no Brasil: https://getdeploying.com/datacenters-in-brazil
