# Quais ferramentas de IA servem para os assets 3D?

Issue #24 · pesquisa feita em 25/11/2026 · fontes primárias (termos de uso, páginas de preço e licenças oficiais) consultadas nesta data.

## Contexto

O pipeline decidido na #15 é: modelos 3D simples, renderizados no Blender como sprites isométricos em 8 direções. O MVP tem combate PvE, 5 classes com 4 skills cada, e personagens, criaturas e alguns prédios marcantes de Taquara. Por isso a IA precisa entregar **malhas importáveis no Blender (GLB/FBX/OBJ)**, de preferência **rigadas** no caso de personagens e criaturas. O jogo terá **lançamento público**, então o ponto decisivo é: **quem é dono do asset gerado e se ele pode ser usado comercialmente**.

## Resumo por ferramenta

| Ferramenta | Plano grátis: licença do output | Plano pago: licença do output | Rig / animação | Custo de entrada | Fonte verificada |
|---|---|---|---|---|---|
| **Meshy** | **Meshy é dona**; você recebe CC BY 4.0 (exige crédito à Meshy) | "Private & customer owned": você é dono | Auto-rig humanoide e quadrúpede (cão), "Smart Rig" beta para criaturas/robôs; FBX/GLB; esqueleto compatível com Mixamo; 20 animações grátis, 500+ no pago | Pro US$ 20/mês (1.000 créditos, ~100 assets) | Termos de 19/09/2026, página de preços |
| **Tripo** | Modelos públicos sob CC BY 4.0 | "Private models, commercial use available" | "Export with skeleton" só nos planos pagos | Professional US$ 15,90/mês promocional (lista US$ 19,90), 3.000 créditos | Página de preços (os termos completos não abriram daqui, ver ressalvas) |
| **Hyper3D Rodin** | Sem "unlimited export and any use"; galeria pública; 10 assets privados | Creator (US$ 30/mês, ~60 modelos) inclui "Unlimited export and any use"; os termos dizem "we will not limit your use of such Output" | Não é o foco (gera malha e PBR; tem "Smart Low-Poly" no pago) | US$ 30/mês | Termos (sem data na página), preços |
| **Hunyuan3D 2.1 (Tencent, open weights)** | Roda localmente de graça | idem | Não rigga | GPU própria | LICENSE de 13/06/2025 |
| **Stable Diffusion (texturas e concept)** | Community License: grátis até US$ 1 mi/ano de receita | Enterprise acima disso | n/a | GPU própria | stability.ai/license |
| **Mixamo (Adobe)** | Grátis com Adobe ID; uso "royalty free for personal, commercial, and non-profit projects", jogos citados explicitamente | n/a | Auto-rig **só para bípedes humanoides** e biblioteca de animações | Grátis | FAQ da Adobe |

## Detalhes e citações

### Meshy
- Termos de uso, "Last Updated: September 19, 2026", seção 3.2. No plano grátis, "Meshy owns all right, title, and interest, including all intellectual property rights, in and to the Customer Output" e libera esse output sob CC BY 4.0 com crédito à Meshy. No plano pago, "customers on a paid Meshy plan own their Customer Output". Fonte: https://www.meshy.ai/terms-of-use
- Seção 3.3: o que for **publicado na Meshy Community** passa a ser CC0, ou seja, qualquer um pode reutilizar. **Nunca publique os assets do jogo na Community.**
- Central de ajuda: no pago você mantém "full private ownership… provided you do not publish them publicly to the Meshy Community". Fonte: https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models
- Os termos também proíbem usar os outputs para treinar IA concorrente (2.6). Isso não afeta o jogo.
- Preços (página oficial, 25/11/2026): Free com 100 créditos, até 10 assets e licença CC BY 4.0. Pro custa US$ 20/mês ou US$ 12/mês no anual em promoção de Black Friday até 02/12/2026, com 1.000 créditos e licença "Private & customer owned". Image-to-3D custa 20 a 25 créditos; Remesh, Rigging e Animate custam 0. Fontes: https://meshy.ai/pricing e https://docs.meshy.ai/en/webapp/pricing
- Rigging: humanoide, "Quadruped Dog" e Smart Rig (beta) para criaturas, robôs e props. Ideal em T-pose ou A-pose. Malhas com mais de 300k faces precisam passar por Remesh antes. A exportação é FBX/GLB, com o esqueleto padrão no template Mixamo. Fonte: https://docs.meshy.ai/en/webapp/guides/3d-model/rigging

### Tripo (VAST)
- Preços oficiais: Basic (grátis, 300 créditos) gera "Public models under CC BY 4.0". Professional, Advanced e Premium geram "Private models, commercial use available" e incluem "export with skeleton". Fonte: https://tripo3d.ai/pricing
- **Ressalva:** os termos completos (https://www.tripo3d.ai/terms) e a página de ajuda sobre uso comercial recusaram conexão a partir do ambiente desta pesquisa. A titularidade está confirmada só pela página de preços. Leia a cláusula de titularidade dos termos antes de assinar.

### Hyper3D Rodin (Deemos)
- Termos, seção 5: outputs do Rodin podem ser exportados "for private or commercial use depending on your subscription plan", e "we will not limit your use of such Output". A empresa não garante que o output seja protegível por direito autoral. Ela pode usar prompts e outputs para "provide, maintain and improve our services, and conduct and support research". Marcar o asset como privado limita a exibição à sua conta. A página não mostra data de revisão. Fonte: https://hyper3d.ai/legal/terms
- Preços: no Free, "Unlimited export and any use" **não** está incluído e os assets vão para a galeria pública (10 privados). Creator custa US$ 30/mês (US$ 24 no anual), rende ~60 modelos e inclui uso irrestrito e assets privados ilimitados. Fonte: https://hyper3d.ai/pricing?lang=en
- A página "copyright-license" tem placeholders não preenchidos ("[module]", "[Price]"). Vale como sinal de documentação jurídica pouco cuidada. Fonte: https://hyper3d.ai/legal/copyright-license

### Hunyuan3D 2.1 (Tencent, pesos abertos)
- Licença "Tencent Hunyuan 3D 2.1 Community License Agreement", de 13/06/2025:
  - "THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA". O Brasil está dentro do território.
  - Seção 6(d): "Tencent claims no rights in Outputs You generate".
  - Seção 4: acima de 1 milhão de MAU é preciso pedir licença. Isso fica muito longe dos ~200 CCU do MVP.
  - Seção 5(b): os outputs não podem ser usados para melhorar outros modelos de IA.
  - Fonte: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE
- Gera forma e textura PBR ("Production-Ready PBR Material", arXiv 2506.15442). **Não rigga.** Exige GPU local (não verificamos o requisito de VRAM) ou um serviço de terceiros, que traz termos próprios.
- Risco: se alguém da equipe operar o modelo a partir da UE ou do Reino Unido, a licença não cobre. Para um time no RS, não é problema.

### Stable Diffusion (texturas, concept, imagem de referência para image-to-3D)
- Stability AI Community License: uso comercial gratuito para organizações com menos de US$ 1 mi de receita anual. "You own outputs generated from the Core Models". Uso comercial exige registro na Stability. Fonte: https://stability.ai/license

### Mixamo
- "Mixamo is available free for anyone with an Adobe ID"; "characters and animations royalty free for personal, commercial, and non-profit projects", com "Create video games" listado como exemplo. Limitações: "bipedal humanoids only", e Enterprise/Federated IDs e contas com código de país China ficam de fora. Fonte: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Bom complemento para as 5 classes, que são humanoides. Não serve para criaturas quadrúpedes ou amorfas.

## Titularidade na prática (direito brasileiro)

- A "propriedade" prometida pelos planos pagos é **contratual**: a ferramenta renuncia a direitos e não reivindica nada. Isso **não** garante que o asset tenha proteção autoral. A Lei 9.610/98, art. 11, define autor como "a pessoa física criadora" (https://www.planalto.gov.br/ccivil_03/leis/l9610.htm). Um output puramente gerado por IA pode não ser protegível, e terceiros poderiam copiá-lo. O retrabalho humano no Blender (retopologia, ajuste de proporções, pintura, composição das poses e do sprite final) é o que fortalece a autoria. Rodin também diz explicitamente que não garante essa protegibilidade.
- **Plano grátis com CC BY 4.0 é tecnicamente utilizável comercialmente, mas não serve para o jogo.** Na Meshy, a dona continua sendo a Meshy. Em Meshy e Tripo, o asset fica público ou reutilizável por qualquer um, e o crédito é obrigatório. Gere tudo do jogo só em plano pago e com o asset privado.
- **Prédios reais de Taquara:** fazer image-to-3D a partir de fotos de terceiros (Google Street View, sites, redes sociais) cria um problema de direitos sobre a **imagem de entrada**. Use fotos tiradas pela equipe ou desenhos próprios. A fachada de um prédio visível de logradouro público pode ser representada (LDA art. 48). Evite logotipos e marcas comerciais nas fachadas.
- Ninguém garante não-infringência: Rodin e Meshy põem a responsabilidade no usuário. Revise outputs que pareçam personagens conhecidos.

## Fluxo recomendado

1. **Concept e referência:** desenho próprio ou Stable Diffusion local (Community License, grátis abaixo de US$ 1 mi). Gere cada personagem em T-pose/A-pose, frontal, em fundo neutro.
2. **Personagens das 5 classes e criaturas:** **Meshy Pro (US$ 20/mês; assinar 1 a 3 meses durante a produção)**. Fluxo: image-to-3D, depois Remesh com polycount baixo (o sprite é pequeno; 5 a 15k tris bastam), depois Auto-Rig (humanoide, quadrúpede ou Smart Rig), e por fim exportar FBX/GLB com esqueleto Mixamo. Para animações de combate (idle, walk, attack, cast, hit, death), use a biblioteca da Meshy ou o **Mixamo** (grátis, humanoides).
3. **Prédios marcantes e props:** Meshy (mesmo plano) ou **Hunyuan3D 2.1 local**, se houver GPU, que tem custo zero e licença compatível no Brasil. Rodin Creator só se a qualidade de forma justificar mais US$ 30/mês. Prédios simples costumam sair melhores modelados à mão com blocos no Blender e texturizados com SD/Meshy Texture do que gerados por IA.
4. **Blender:** importar, limpar, decimar e unificar escala e material (paleta comum), montar câmera isométrica fixa e renderizar 8 direções × frames por animação para gerar os spritesheets (pipeline da #15).
5. **Registro de procedência** (planilha ou JSON no repositório) para cada asset: ferramenta, plano ativo na data, ID do asset, prompt/imagem de entrada e se ela é própria, data, e recibo da assinatura. Esse registro prova o direito contratual se alguém questionar.
6. **Nunca** publicar nas galerias ou comunidades das ferramentas (Meshy Community vira CC0) e manter os assets marcados como privados.

## Estimativa de custo

Meshy Pro: 1.000 créditos/mês ≈ 40 a 50 gerações de image-to-3D (20 a 25 créditos cada) com rig e animação grátis. Para 5 classes, ~10 criaturas e ~10 prédios ou props, com várias tentativas, 2 a 3 meses de Pro (≈ US$ 40 a 60) devem bastar. Hunyuan3D, SD e Mixamo não têm custo de licença.

## Ressalvas

- Os termos da Tripo não puderam ser lidos (o site recusou a conexão). A titularidade da Tripo vem só da página de preços.
- Os preços de Meshy e Tripo estão com desconto de Black Friday (até 02/12/2026). Os valores de lista estão indicados.
- Requisitos de VRAM do Hunyuan3D 2.1 e qualidade/topologia comparada entre as ferramentas não foram medidos aqui. Recomenda-se um teste prático com o mesmo concept nas 2 ou 3 ferramentas antes de assinar.
