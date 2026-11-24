# Login social (Google + Discord) com modo convidado

> Pesquisa para a issue #8 (filha do mapa #1). Data: 2026-11-24.
> Versões verificadas no npm nesta data: `better-auth` 1.7.28 (beta 1.8.0-beta.11), `colyseus` 0.18.12, `@colyseus/core` 0.18.29, `@colyseus/auth` 0.18.4, `next-auth` 4.24.15 (v5 ainda em `5.0.0-beta.32`).

## Recomendação

**Better Auth** (MIT, self-hosted, Drizzle + Postgres) com os plugins `anonymous`, `jwt` e `captcha` (Cloudflare Turnstile), providers sociais `google` e `discord`. O servidor Colyseus valida um JWT curto (EdDSA, 15 min) no `static onAuth` usando `jose` contra o JWKS do Better Auth. Custo de licença zero; as tabelas de auth ficam no mesmo Postgres do jogo.

## Comparação

| Opção | Manutenção (nov/2026) | Custo | Convidado → conta | Encaixe no stack |
|---|---|---|---|---|
| **Better Auth** | Ativo; 1.7.x estável, 1.8 em beta. Adquirido pela Vercel em 07/07/2026, continua MIT [1] | Grátis (self-host) | Plugin `anonymous` + `onLinkAccount` (cria usuário novo, você migra dados) [2][3] | Adapter Drizzle oficial, Node puro, Google/Discord nativos [4] |
| **Auth.js / NextAuth** | Desde 22/09/2025 mantido pelo time Better Auth só com patches de segurança/urgentes; recomendam Better Auth para projetos novos [5]. v5 ainda beta | Grátis | Sem convidado nativo | Centrado em Next.js; descartado |
| **@colyseus/auth** | Mantido junto com Colyseus 0.18 | Grátis | Tem "anonymous registration" e OAuth (Discord, Google...) [6] | Acoplado ao servidor de jogo; ecossistema e docs de conversão bem menores que Better Auth |
| **Clerk** | Gerenciado, ativo | Grátis até 50.000 MRU; Pro US$ 25/mês + US$ 0,02/MRU [7] | Página de preços não menciona usuário anônimo/convidado [7] | Dados de usuário fora do nosso Postgres; precisa de webhooks para sincronizar |
| **Supabase Auth** | Gerenciado/self-host, ativo | Plano grátis do Supabase | Anonymous sign-in nativo; converte com `linkIdentity()` (OAuth) e claim `is_anonymous` no JWT; rate limit 30 req/h por IP; sem limpeza automática de anônimos [8] | Bom, mas traz o GoTrue/Supabase como peça extra fora do Drizzle |

## Como funciona o convidado no Better Auth (verificado no código 1.7.28)

- `POST /sign-in/anonymous` cria um `user` com e-mail placeholder (`...@anonymous.placeholder.invalid` por padrão), nome `"Anonymous"` (customizável com `generateName`) e `isAnonymous: true` (coluna booleana adicionada à tabela `user`) [2][3].
- Um convidado não pode chamar sign-in anônimo de novo (erro) [3].
- Ao fazer `signIn.social({ provider: "google" | "discord" })` estando como convidado, um hook `before` guarda o `anonymousUserId` no state OAuth (no servidor), e o hook `after` no `/callback` chama `onLinkAccount({ anonymousUser, newUser })` [3].
- **O ponto importante: não se mantém o mesmo `userId`.** O login social cria (ou encontra) outro `user`; depois do `onLinkAccount` o usuário anônimo é **apagado** por padrão, a menos que `disableDeleteAnonymousUser: true` [2][3].
  - Consequência de design: os dados do jogo (personagem, posição, inventário) devem ficar numa tabela `player` com FK `user_id`, e o `onLinkAccount` faz `UPDATE player SET user_id = newUser.id WHERE user_id = anonymousUser.id` numa transação. Se a conta social já tinha personagem, decidir a regra (manter o existente, descartar o do convidado).
- Se o 2FA estiver pendente, `onLinkAccount` não é chamado e o anônimo é mantido [2].
- Limpeza: convidados que nunca convertem acumulam; agendar um job que apaga `user` com `isAnonymous = true` sem sessão ativa há N dias (Supabase documenta o mesmo problema [8]).
- Abuso: lançamento público + sign-in anônimo sem fricção => usar o plugin `captcha` (suporta `cloudflare-turnstile`) e o rate limit do Better Auth no endpoint `/sign-in/anonymous`.

## Validação da sessão ao entrar numa sala Colyseus

Colyseus 0.18 [9]:
- Cliente: `client.auth.token = jwt`; o SDK manda o token como header `Authorization` no matchmaking (`joinOrCreate` etc.).
- Servidor: `static async onAuth(token, options, context)` roda **antes** de a sala existir (recomendado). O retorno vira `client.auth` e o 3º argumento de `onJoin`. Lançar erro rejeita a entrada.
- `context` (tipo `AuthContext` em `@colyseus/core` 0.18.29) tem `token`, `ip`, `headers` e `req` [10].
- Atenção: o `static onAuth` padrão deixa passar cliente **sem token** com `auth` vazio [9]. Precisamos sobrescrever e rejeitar quando `token` for vazio.

Fluxo proposto:

1. Front (Phaser/React) faz login (anônimo ou social) no Better Auth (cookie de sessão no domínio da API).
2. Antes de entrar na sala, chama `authClient.token()` (plugin `jwt`; endpoint `/api/auth/token`) e recebe um JWT EdDSA/Ed25519 de 15 min [11].
3. `client.auth.token = jwt; client.joinOrCreate("taquara_centro")`.
4. No servidor de jogo:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));

export class CityRoom extends Room {
  static async onAuth(token: string | undefined) {
    if (!token) throw new ServerError(401, "login necessário");
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL, audience: AUTH_URL,
    });
    return { userId: payload.sub, isAnonymous: payload.isAnonymous, name: payload.name };
  }
  onJoin(client, options, auth) { /* carrega player por auth.userId */ }
}
```

- Use `definePayload` no plugin `jwt` para limitar o payload a `id`, `name`, `isAnonymous` [11].
- Vantagem do JWT: o servidor Colyseus não consulta o banco de sessões a cada join, e pode rodar em outro processo/host; JWKS fica em cache no `jose`.
- Alternativa se Better Auth e Colyseus estiverem no mesmo processo Express: ler o cookie em `context.headers` e chamar `auth.api.getSession({ headers })`. Funciona, mas acopla os dois e exige cookies cross-origin configurados; JWT é mais simples.
- Revogação: um JWT de 15 min continua válido após logout/ban. Para ban imediato, checar uma lista de banidos no `onAuth` (consulta barata) e expulsar clientes já conectados pelo `userId`.
- A conversão convidado → conta muda o `userId`; um jogador conectado deve sair e reentrar na sala com o JWT novo (ou o servidor atualiza `client.auth` via mensagem). Simples no MVP: reconectar após o login.

## Fontes

1. Vercel, "Vercel acquires Better Auth" (07/07/2026): https://vercel.com/blog/vercel-acquires-better-auth
2. Better Auth docs, plugin Anonymous: https://better-auth.com/docs/plugins/anonymous
3. Código-fonte `better-auth@1.7.28`, `dist/plugins/anonymous/index.mjs` e `schema.mjs` (npm pack, lido em 2026-11-24)
4. Better Auth docs, Discord provider: https://better-auth.com/docs/authentication/discord
5. Better Auth blog, "Auth.js is now part of Better Auth" (22/09/2025): https://better-auth.com/blog/authjs-joins-better-auth
6. Colyseus docs, Authentication: https://docs.colyseus.io/auth
7. Clerk pricing: https://clerk.com/pricing
8. Supabase docs, Anonymous Sign-Ins: https://supabase.com/docs/guides/auth/auth-anonymous
9. Colyseus docs (0.18), Room Authentication: https://docs.colyseus.io/auth/room
10. Código-fonte `@colyseus/core@0.18.29`, `build/Transport.d.ts` (`AuthContext`)
11. Better Auth docs, plugin JWT: https://better-auth.com/docs/plugins/jwt
