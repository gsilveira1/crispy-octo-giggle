# @bigriver/meshy

Gera os modelos 3D dos personagens na [Meshy](https://www.meshy.ai) pela API, a partir dos conceitos 2D em `docs/assets/conceitos/<id>.jpg`. Prompts, especificações e o registro de procedência ficam em [`docs/assets/prompts-personagens.md`](../../docs/assets/prompts-personagens.md).

## Antes de rodar

- **Chave:** variável de ambiente `MESHY_API_KEY` (no ambiente de nuvem ou num arquivo `.env` na raiz do repositório, que está no `.gitignore`). Nunca faça commit da chave. O nome `MESHY_API_KEYy` também é aceito, porque foi assim que a chave ficou salva no ambiente de nuvem.
- **Rede:** precisa alcançar `api.meshy.ai` (API) e `assets.meshy.ai` (download dos arquivos). Na nuvem, rode com `NODE_USE_ENV_PROXY=1` para o Node usar o proxy.
- **Plano pago:** os modelos gerados pela API num plano pago são privados. Nunca publique nada na comunidade da Meshy.
- `pnpm install` na raiz (instala o `gltf-transform`, usado no `pick`).

## Uso

```sh
pnpm meshy balance                      # créditos disponíveis
pnpm meshy gen class-peao npc-padre     # gera um ou mais personagens
pnpm meshy gen enemy-cria --variants=3  # várias variações para escolher
pnpm meshy pick class-peao 1            # escolhe a variação 1 e coloca no jogo
```

### `gen <id...>`

Para cada `<id>`:

1. **Image to 3D** com o conceito `docs/assets/conceitos/<id>.jpg`: modelo mais recente da Meshy, *remesh* em triângulos para a contagem do grupo (classes e Vultos 12 mil, sobreviventes 6,5 mil, crias 4,5 a 6 mil, chefe 20 mil), textura PBR, pose A.
2. **Rigging** automático da Meshy (só humanoides), com a altura do grupo. Vem com animações de andar e correr. Se o rigging falhar (criaturas de quatro patas), fica o modelo sem esqueleto.
3. Baixa tudo em `data/meshy/<id>/`: miniatura `<id>.vN.png`, modelo estático, modelo com esqueleto `<id>.vN.glb` e animações. Os `.glb` brutos (~10 MB cada) ficam fora do git; o `log.json` com os ids das tarefas e os créditos entra no git.

Opções: `--variants=N` (padrão 1), `--no-rig`, `--model=<modelo da Meshy>`, e `--from-task=<id>` / `--from-rig=<id>` para retomar uma geração já paga (por exemplo, quando o download falhou) sem gastar créditos de novo.

### `pick <id> <n>`

Copia a variação escolhida para `apps/game/public/models/<id>.glb`, reduz as texturas para 1024 px WebP (de ~10 MB para ~2 MB) e copia as animações (`<id>.walking.glb`, `<id>.running.glb`, só o esqueleto). Depois adiciona a linha do personagem no **registro de procedência** do `prompts-personagens.md`.

## Custos (medidos em 2026-11-25)

| tarefa | créditos |
| --- | --- |
| Image to 3D com textura e remesh | 30 |
| Rigging (com andar e correr) | 5 |

Um personagem humanoide com uma variação custa ~35 créditos.

## No jogo

`apps/game/src3d/world/skinned.ts` liga as juntas procedurais do `Player` aos ossos da Meshy (`Hips`, `Spine01`, `Spine`, `neck`, `LeftArm`…), então os golpes, a esquiva e a queda que já existem animam o modelo sem precisar de animações novas. Para trocar o personagem, mude o caminho do `.glb` em `apps/game/src3d/main.ts`.
