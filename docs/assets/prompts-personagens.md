# Prompts dos modelos 3D dos personagens

Prompts para gerar o modelo 3D de cada personagem do MVP numa ferramenta de IA (recomendada: **Meshy Pro**, issue #24). Cobre as 5 classes, as crias da Cerração, o chefe, os três Vultos, o Negrinho do Pastoreio e os sobreviventes dos refúgios.

Os prompts estão em **inglês** porque as ferramentas respondem melhor nessa língua. A descrição em português ao lado diz o que cada um precisa ter. Cada prompt completo tem menos de 600 caracteres (limite do *Text to 3D* da Meshy) e já inclui o estilo comum resumido; os da tabela de sobreviventes precisam do estilo colado no fim.

> **Antes de gerar:** use só plano **pago e privado** (no grátis a ferramenta fica dona do modelo ou o publica) e nunca publique na comunidade da ferramenta. Anote cada geração no registro de procedência (fim deste arquivo). Detalhes em `research/ia-assets-3d.md` (branch `research/ia-assets-3d`).

## Fluxo

1. **Conceito (recomendado):** gere uma imagem de frente em pose A com o mesmo prompt (Stable Diffusion ou desenho próprio). Image-to-3D a partir de uma imagem boa dá resultado bem melhor que só texto. Os conceitos prontos ficam em [`conceitos/`](conceitos/) com o mesmo `<id>`.
2. **Modelo:** Meshy Pro, *Image to 3D* (ou *Text to 3D* com o prompt daqui). Gere 4 variações e escolha a de silhueta mais clara vista de cima.
3. **Malha:** *Remesh* para a contagem de triângulos da tabela abaixo, quads quando possível.
4. **Esqueleto e animação:** humanoides com *Auto-Rig* da Meshy ou Mixamo; criaturas com *Smart Rig*. Animações na lista de cada personagem.
5. **Blender:** limpar, conferir escala e orientação, separar a arma num objeto próprio, ajustar a paleta, reduzir texturas.
6. **Exportar** `.glb` para `apps/game/public/models/<id>.glb` (o `<id>` está em cada personagem).
7. **Registrar** a procedência.

## Especificações técnicas (valem para todos)

| Item | Valor |
| --- | --- |
| Formato | glTF binário (`.glb`), com esqueleto e animações dentro |
| Escala | 1 unidade = 1 metro; humano adulto com 1,75 m a 1,80 m (sem chapéu) |
| Orientação | Y para cima, personagem olhando para +Z, pés em Y = 0 |
| Pose de modelagem | pose A (braços a ~45°), mãos abertas, sem arma na mão (arma em objeto separado) |
| Triângulos | protagonistas e Vultos: 8 a 15 mil; crias: 3 a 6 mil; chefe: 15 a 25 mil; sobreviventes: 5 a 8 mil |
| Texturas | PBR (cor, normal, rugosidade/metal), 1024 px; chefe e Vultos até 2048 px |
| Esqueleto | humanoides com nomes Mixamo (`mixamorig:Hips`…); o osso da mão direita carrega a arma |
| Câmera do jogo | quase de cima (62°) e de longe: a **silhueta vista de cima** (chapéu, ombros, cor) precisa identificar o personagem |

## Estilo comum

Cole este trecho no fim de **todo** prompt (já está incluído nos prompts abaixo, de forma resumida):

```
stylized semi-realistic game character, slightly chunky proportions, hand-painted PBR textures, strong readable silhouette from a high top-down camera, muted earthy palette with one saturated accent color, clean topology, A-pose, full body, plain background
```

Prompt negativo (para ferramentas que aceitam):

```
photorealistic, anime, chibi, cartoonish big head, cel shading outlines, text, logo, watermark, weapon fused to hand, extra limbs, extra fingers, T-pose, base or pedestal, modern sportswear, sunglasses
```

Clima geral: interior gaúcho de hoje, logo depois de uma névoa sobrenatural (a **Cerração**). Roupas de uso real, gastas, com barro e umidade. Nada de fantasia medieval genérica: a fantasia vem do folclore.

---

## Classes jogáveis

Cada classe tem uma versão masculina e uma feminina (troque a primeira frase do prompt pelo trecho indicado). O jogador escolhe ainda se é **morador** de Taquara ou **forasteiro**, mas isso muda só o diálogo, não o modelo.

Animações das classes (issue #15 e #17): parado, andar, correr, esquiva, ataque básico em sequência de 3, uma animação por habilidade (4), levar dano, cair, abalado (parado cansado), beber chimarrão.

### Peão (`class-peao`)
Aguenta pancada e segura os inimigos. Trabalhador de estância: largo, firme, roupa de lida.

```
A sturdy gaucho ranch hand from southern Brazil, broad shoulders, weathered tanned face, short beard. Wears a dark felt hat with wide brim, red neckerchief, thick wool poncho in earthy brown with ochre stripes, baggy bombacha trousers tucked into tall worn leather boots, wide leather belt (guaiaca) with silver coins. Leather bracers and a small round rawhide shield on the left forearm. Mud on boots, rain-damp fabric. Stylized semi-realistic game character, chunky proportions, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```
- Feminina: `A sturdy gaucha ranch hand from southern Brazil, broad shoulders, weathered tanned face, braided dark hair under the hat.`
- Arma separada (`class-peao-weapon`): `A heavy wooden ranch club reinforced with iron bands, rawhide grip, game prop, stylized PBR.`

### Benzedeira (`class-benzedeira`)
Cura e protege. Rezadeira do interior: humilde, firme, cheia de pequenos objetos de fé popular.

```
An elderly folk healer (benzedeira) from rural southern Brazil, kind but stern face, silver hair in a bun under a white headscarf. Wears a long simple floral dress in faded blue, a knitted wool shawl, an apron with pockets full of herbs, a cloth bag with sprigs of rue and rosemary, a wooden rosary and small medals. Holds nothing; hands open. Soft warm glow suggested on the shawl embroidery. Stylized semi-realistic game character, slightly chunky proportions, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```
- Masculina: `An elderly folk healer (benzedor) from rural southern Brazil, kind but stern face, white beard, wearing a straw hat.` (troque o vestido por `simple cotton shirt and dark trousers`).
- Objeto separado (`class-benzedeira-prop`): `A bundle of green rue and rosemary branches tied with red thread, game prop, stylized PBR.`

### Tropeiro (`class-tropeiro`)
Dano à distância com laço e boleadeira. Condutor de tropa, viajado, ágil.

```
A lean gaucho cattle drover (tropeiro) from southern Brazil, alert eyes, thin mustache, sun-worn skin. Wears a low-crowned black hat with chin strap, short leather vest over a cream shirt, grey poncho thrown over one shoulder, bombacha trousers, soft leather boots with spurs. A coiled rawhide lasso hangs on the right hip and bolas (three stone balls on leather cords) on the left hip. Dust and mud on the clothes. Stylized semi-realistic game character, slightly chunky proportions, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```
- Feminina: `A lean gaucha cattle drover (tropeira) from southern Brazil, alert eyes, long dark hair tied low, sun-worn skin.`
- Armas separadas: `class-tropeiro-lasso` (`A coiled braided rawhide lasso, game prop.`) e `class-tropeiro-bolas` (`Gaucho bolas: three round stones wrapped in leather on braided cords, game prop.`).

### Cavaleiro (`class-cavaleiro`)
Dano corpo a corpo, rápido e móvel. Luta a pé (o cavalo é só tema). É a classe do protótipo atual.

```
A young agile gaucho horseman fighting on foot, southern Brazil, confident face, short stubble. Wears a wide-brimmed dark hat, red neckerchief, rust-red wool poncho with gold and black stripes and short fringe, white shirt, dark baggy bombacha trousers, tall black riding boots with silver spurs, leather belt with a sheath for a long knife (facão). Light, mobile stance. Stylized semi-realistic game character, slightly chunky proportions, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```
- Feminina: `A young agile gaucha horsewoman fighting on foot, southern Brazil, confident face, dark hair in a low ponytail.`
- Arma separada (`class-cavaleiro-weapon`): `A long gaucho knife (facão) with a slightly curved steel blade and a worn horn handle with silver ferrule, game prop, stylized PBR.`

### Feiticeiro (`class-feiticeiro`)
Dano mágico em área. Herdeiro dos segredos da Salamanca do Jarau: mistério, couro, pedras e brasa.

```
A mysterious sorcerer from southern Brazilian folklore, gaunt face with dark eyes, long black hair. Wears a long dark leather coat over a ragged poncho with faint glowing ember-orange symbols, a carved pendant of a red stone (carbúnculo) on the chest, belts with small pouches and vials, a necklace of animal teeth, worn boots. A faint orange glow around the hands. Stylized semi-realistic game character, slightly chunky proportions, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```
- Feminina: `A mysterious sorceress from southern Brazilian folklore, gaunt face with dark eyes, long black hair with a few grey streaks.`
- Objeto separado (`class-feiticeiro-staff`): `A gnarled wooden staff topped with a glowing red gemstone held by roots, game prop, stylized PBR.`

---

## Crias da Cerração (inimigas)

Criaturas menores da névoa. Precisam parecer **feitas de sombra e névoa**, não animais reais nem pessoas. Nunca devem lembrar grupos humanos reais. Animações: parado, andar, correr, aviso de ataque (braços erguidos), ataque, levar dano, atordoada, desfazer-se (morte). Rig: *Smart Rig* (criatura).

O efeito de fumaça e o brilho dos olhos são feitos no jogo; o modelo só precisa da forma e de uma textura escura com veios azulados.

### Cria (`enemy-cria`)
```
A small hunched creature made of dark living mist and shadow, about 1.3 meters tall, long thin arms ending in sharp claws, crooked back, featureless face with two small glowing eye sockets, wisps of smoke trailing from shoulders and back, body texture of dark charcoal with faint bluish veins. Creepy but readable, not gory. Stylized game creature, low poly, hand-painted PBR, strong silhouette from top-down camera, neutral pose, full body.
```

### Cria graúda (`enemy-cria-grauda`)
```
A large hulking creature made of dense dark mist and shadow, about 2 meters tall, massive shoulders, one oversized arm with heavy claws, bent posture, small head sunk between the shoulders with two glowing eye sockets, cracks of faint ember light on the chest, smoke trailing from the back. Creepy but readable, not gory. Stylized game creature, hand-painted PBR, strong silhouette from top-down camera, neutral pose, full body.
```

### Cria rasteira (`enemy-cria-rasteira`) — opcional
Variação de quatro patas para bandos rápidos (ainda não decidida; gere só se for usar).
```
A low four-legged creature made of dark mist and shadow, size of a large dog, elongated body, spine of smoky spikes, long snout without visible eyes except two faint glowing slits, claws, wisps trailing from the tail. Creepy but readable, not gory. Stylized game creature, hand-painted PBR, strong silhouette from top-down camera, neutral pose, full body.
```

---

## Chefe

### Lobisomem (`boss-lobisomem`)
Chefe do fim da linha principal (issue #6). A reviravolta é ser alguém conhecido de um refúgio, então mantenha **um detalhe da roupa humana** (o lenço e restos da camisa) que o jogador possa reconhecer no NPC antes da revelação. Escolha esse NPC antes de gerar e use o mesmo lenço. Animações: parado, andar, correr de quatro, uivo, golpe de garra, salto, investida, levar dano, atordoado, morte, e a transformação (humano → lobo) se o roteiro pedir.

```
A towering werewolf from Brazilian folklore, about 2.6 meters tall, hunched, long lean limbs, matted dark grey-brown fur damp with mist, elongated snout with bared fangs, pale yellow eyes, huge clawed hands. Remnants of human clothing: a torn checkered shirt hanging from one shoulder and a faded red-and-white neckerchief still tied at the neck. Mud on the legs. Menacing but not gory. Stylized semi-realistic game boss, hand-painted PBR, strong silhouette from top-down camera, neutral standing pose, full body.
```

---

## Vultos (figuras históricas trazidas pela Cerração)

Os Vultos **dão missões e nunca são inimigos em combate** (issue #21: nada de combate contra Vultos negros). O aspecto de espírito (translucidez, névoa nas bordas, brilho fraco) é feito **no jogo com shader**; o modelo é a pessoa, sólida, com roupa de época.

Cuidados obrigatórios (issue #21):
- **Sem caricatura** de nenhum dos três. Rostos sérios, dignos, sem exagero.
- **Zumbi dos Palmares não tem retrato de época.** Use a iconografia contemporânea consolidada pelo movimento negro (o busto da Praça Onze, no Rio, e o 20 de Novembro) como referência de dignidade, não um rosto inventado com traços estereotipados.
- **Revisão antes do lançamento:** os modelos de Zumbi, do Negrinho e dos Lanceiros passam pelas comunidades citadas na #21 (movimento negro, Quilombo do Paredão Baixo, historiadores) junto com o roteiro.
- Animações: parado, falar (gestos), aparecer/desaparecer, um gesto próprio de cada um.

### Bento Gonçalves (`vulto-bento`)
Estancieiro e líder farroupilha. Assimetria moral explícita no roteiro, mas sem caricatura.
```
A dignified 19th-century southern Brazilian rancher and military leader in his fifties, stern weathered face, grey sideburns and mustache, thinning grey hair. Wears an 1830s dark blue military frock coat with modest gold buttons and epaulettes, a red sash, white shirt with high collar, dark trousers, tall black riding boots, a sabre scabbard on the belt (sabre as separate object). Proud, rigid posture. Historically accurate clothing. Stylized semi-realistic game character, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```

### Zumbi dos Palmares (`vulto-zumbi`)
Líder de Palmares (século XVII). Tem projeto próprio no roteiro: não é coadjuvante de ninguém.
```
A dignified Black Brazilian leader of the 17th-century Palmares quilombo, tall and strong, calm determined face, short hair, in his forties. Wears simple period clothing: a light cotton tunic and trousers, a wide cloth sash at the waist, a cloth wrap over one shoulder, leather sandals, a few wooden and seed bead necklaces. Holds nothing. Serene, upright, commanding posture, respectful and non-stereotyped depiction inspired by contemporary Brazilian commemorative iconography. Stylized semi-realistic game character, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```

### Giuseppe Garibaldi (`vulto-garibaldi`)
Testemunha incômoda e mediador, nunca "salvador".
```
A 19th-century Italian revolutionary in his early thirties during the Ragamuffin War in southern Brazil, reddish-blond hair to the shoulders and full beard, intense eyes. Wears a red woolen shirt, a grey gaucho poncho over the shoulders, a dark neckerchief, a wide felt hat, dark trousers and worn boots, a sailor's knife at the belt. Restless, alert posture. Historically accurate clothing. Stylized semi-realistic game character, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```

### Lanceiro Negro (`npc-lanceiro`) — testemunha
Os Lanceiros podem servir de testemunhas e juízes no roteiro (#21). Gere um modelo base e varie rosto e cor da roupa no Blender.
```
A dignified Black lancer soldier of the 1840s Ragamuffin War in southern Brazil, young and strong, serious face. Wears a simple poncho over a white shirt, a red neckerchief, bombacha-style trousers, bare feet or simple sandals, a leather strap across the chest. Long lance as a separate object. Proud, upright posture, respectful non-stereotyped depiction. Historically accurate clothing. Stylized semi-realistic game character, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```

---

## Lenda

### Negrinho do Pastoreio (`lenda-negrinho`)
Liga-se às missões de resgate: na lenda, ele ajuda a achar o que se perdeu. É uma criança escravizada que, depois de morto, aparece livre e protegido; represente essa **libertação e cuidado**, nunca o sofrimento. Vem com o cavalo baio (modelo separado) e uma vela acesa. Animações: parado, andar, montar/andar a cavalo, apontar o caminho, aparecer/desaparecer.
```
A gentle Black boy of about twelve from southern Brazilian folklore, calm kind face with a faint smile, short hair. Wears simple clean light-colored cotton clothes and a small faded red poncho, barefoot, holding a lit candle in one hand (candle as separate object). Soft warm light around him, peaceful and protected, a respectful and non-stereotyped depiction. Stylized semi-realistic game character, hand-painted PBR, readable silhouette from top-down camera, A-pose, full body.
```
- Cavalo (`lenda-negrinho-baio`): `A bay horse (cavalo baio) with golden-brown coat and dark mane, simple old saddle blanket, calm, stylized semi-realistic, hand-painted PBR, quadruped game model, neutral pose.` (rig quadrúpede)

---

## Sobreviventes dos refúgios (NPCs inventados)

Pessoas e comércios **inventados** (issue #6). Gere um modelo base de cada arquétipo e varie rosto, cabelo e cor da roupa no Blender para encher os refúgios. Animações: parado, andar, conversar, sentar, apontar, se assustar, trabalhar (mexer em caixas).

| id | Arquétipo | Prompt (complete com o estilo comum) |
| --- | --- | --- |
| `npc-comerciante` | dona do armazém | `A middle-aged shopkeeper woman from a small southern Brazilian town, practical apron over a sweater, reading glasses on a cord, rolled sleeves, tired but warm expression.` |
| `npc-padre` | padre da matriz | `An old Catholic parish priest from southern Brazil, black cassock with a simple wooden cross, worn shoes, thin grey hair, gentle face, a raincoat over the shoulders.` |
| `npc-enfermeira` | enfermeira do posto | `A young nurse from a small Brazilian town, light blue scrubs under an open rain jacket, stethoscope, backpack with a first-aid kit, hair tied up, determined face.` |
| `npc-tradicionalista` | velho do CTG | `An old gaucho traditionalist, white mustache, black hat, neckerchief, vest over a white shirt, bombacha and boots, holding a chimarrão gourd (separate object).` |
| `npc-estudante` | estudante da faculdade | `A university student from southern Brazil, hoodie under a raincoat, jeans, sneakers covered in mud, backpack, flashlight hanging from the strap.` |
| `npc-guarda` | guarda municipal | `A municipal guard from a small Brazilian town, dark navy uniform with a reflective vest, cap, radio on the shoulder, flashlight, tired face.` |
| `npc-agricultor` | colono de origem alemã | `A farmer of German descent from the Taquara region, flat cap, plaid flannel shirt, suspenders, work trousers, rubber boots, strong hands, ruddy face.` |
| `npc-crianca` | criança perdida (resgate) | `A child of about eight from a small Brazilian town, oversized yellow raincoat, rubber boots, holding a small flashlight, scared but brave expression.` |

## Conceitos prontos

As imagens de frente em pose A estão em [`conceitos/<id>.jpg`](conceitos/), uma por `<id>` deste arquivo (28 no total). São a entrada do *Image to 3D*.

| grupo | ids |
| --- | --- |
| Classes | `class-peao`, `class-peao-f`, `class-benzedeira`, `class-benzedeira-m`, `class-tropeiro`, `class-tropeiro-f`, `class-cavaleiro`, `class-cavaleiro-f`, `class-feiticeiro`, `class-feiticeiro-f` |
| Crias e chefe | `enemy-cria`, `enemy-cria-grauda`, `enemy-cria-rasteira`, `boss-lobisomem` |
| Vultos e lenda | `vulto-bento`, `vulto-zumbi`, `vulto-garibaldi`, `npc-lanceiro`, `lenda-negrinho`, `lenda-negrinho-baio` |
| Sobreviventes | `npc-comerciante`, `npc-padre`, `npc-enfermeira`, `npc-tradicionalista`, `npc-estudante`, `npc-guarda`, `npc-agricultor`, `npc-crianca` |

Cuidados antes de gerar o 3D:

- **`class-tropeiro`** está mais fotográfico que o resto (rosto e tecido realistas, fundo diferente). Vale gerar de novo com o estilo comum para não destoar da `class-tropeiro-f`.
- **Crias:** os olhos e a fumaça são feitos no jogo. Se o Image to 3D tentar modelar a fumaça em volta da `enemy-cria-grauda` e da `enemy-cria-rasteira`, apague a fumaça da imagem antes (ou use Text to 3D com o prompt).
- **`lenda-negrinho-baio`** e **`enemy-cria-rasteira`** são quadrúpedes: esqueleto pelo *Smart Rig*, não Mixamo.
- **Lobisomem:** a camisa xadrez e o lenço batem com o **`npc-agricultor`**. Se ele for o sobrevivente que vira lobisomem, use a mesma textura de camisa e lenço nos dois modelos (o lenço do agricultor é vermelho liso; o do lobisomem, vermelho e branco desbotado: escolher um).
- Armas e objetos (facão, lança, cuia, laço, lampião) saem num objeto separado no Blender, como diz o passo 5.
- Ao subir no Meshy, plano pago e privado, nunca na comunidade.

---

## Registro de procedência

Uma linha por modelo que entrar no jogo (pedido da issue #24, para provar autoria e licença):

| id | ferramenta e plano | data | entrada (prompt/imagem) | variação escolhida | retoque (quem, o quê) | recibo |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
