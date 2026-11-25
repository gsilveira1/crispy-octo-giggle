# @bigriver/game

Cliente do jogo no navegador: **3D em Three.js** + Vite (decisão em `docs/decisions/0002-cliente-3d.md`).

```bash
pnpm install
pnpm --filter @bigriver/game dev      # http://localhost:5173 (3D)
                                      # http://localhost:5173/2d.html (cliente isométrico antigo, Phaser)
```

`?city=<id>` escolhe a cidade (padrão `taquara`).

## Como funciona (3D, `src3d/`)

- **Escala:** 1 unidade do Three.js = 1 metro de jogo. O tile (coluna, linha) fica em `x = coluna × metersPerTile`, `z = linha × metersPerTile`; norte é −z.
- **Mapa:** o mesmo `public/maps/<id>/` gerado por `pnpm city build <id>` (veja `data/cities/README.md`).
- **Chunks** (`world/chunks.ts`): carrega os chunks num raio de 110 m em volta do jogador e descarrega o resto.
- **Chão** (`world/ground.ts`): uma textura desenhada em canvas por chunk, com placas de concreto, meio-fio, faixa amarela no eixo das ruas com nome e sujeira. O asfalto tem rugosidade baixa para parecer molhado.
- **Prédios** (`world/buildings.ts`): quase todos vêm do Open Buildings sem tipo, então o estilo é inferido. Casa pequena e retangular ganha telhado de telha (quatro águas ou duas águas com oitão); prédio maior ganha laje com platibanda e caixa d'água azul; galpão grande ganha zinco. Fachadas em cores gastas, janelas com veneziana (parte acesa), porta virada para a rua e, em parte das fachadas de frente para a rua, comércio no térreo com vitrine, porta de enrolar, toldo e letreiro. Um recorte pontilhado abre um buraco no que estiver entre a câmera e o jogador.
- **Rua** (`world/ground.ts`): ruas menores com paralelepípedo (textura de detalhe no shader), avenidas em asfalto molhado, meio-fio e bocas de lobo.
- **Objetos** (`world/props.ts`): espalhados de forma determinística (o mesmo tile gera sempre o mesmo objeto): postes de concreto com luminária e fiação ligando os vizinhos, carros estacionados e abandonados, barreiras, caixas e barris perto dos prédios, árvores em praças e matas. Bloqueiam a passagem.
- **Combate** (`combat/`): local, sem servidor. Bandos de 3 a 5 crias da Cerração (às vezes com uma graúda) em volta do refúgio; elas vagam, perseguem quem chega a 9 m, atacam no alcance, voltam para casa se forem longe e renascem em 25 s. Combate de ação: o personagem golpeia na direção do mouse e acerta todas as crias no arco do golpe. Botão esquerdo (E) e direito (D) formam combos: E E E Arremate, D Golpe pesado, E D Estocada (avança), E E D Talho cruzado, D E Rasteira (derruba), D D Golpe de terra (área à frente). Uma habilidade usada logo depois de um golpe que acertou sai encadeada, mais forte (a mira e os botões 1–4 brilham). Impacto com pausa curta, tremor de câmera, empurrão e crítico (15%). As crias avisam o ataque (olhos amarelos, braços erguidos) e dá para esquivar. Habilidades provisórias do Cavaleiro (as definitivas saem da issue #20): 1 Talho, 2 Investida (avança até 9 m na direção do mouse e atordoa), 3 Redemoinho (área), 4 Chimarrão (cura). Ao cair, volta ao refúgio abalado (dano −30% por 20 s).
- **Luz:** noite com lua fria (única luz com sombra), 8 luzes de poste reais que acompanham o jogador, poças de luz pintadas nos demais postes, lampião do personagem, névoa (`FogExp2`) e bloom.
- **Personagem** (`world/player.ts`): forasteiro de poncho, bombacha, chapéu, facão e lampião, montado com um esqueleto de grupos (quadril, coluna, ombros, cotovelos, coxas, joelhos) e animado por código: parado, andar, correr, 3 golpes em sequência, giro, investida, chimarrão, levar dano, esquiva (cambalhota) e queda. Poncho balança com o movimento e o facão deixa rastro. Anda a 4 m/s com aceleração, Shift corre, Espaço esquiva (invulnerável durante o rolamento, recarga de 0,9 s).

## Controles

WASD ou setas para andar (relativo à câmera), Shift para correr, Espaço esquiva, Q/E giram a câmera 45°, roda do mouse para zoom. O mouse só golpeia: esquerdo e direito para golpes e combos, mirando no ponteiro; 1–4 para as habilidades. Decidido em 25/11/2026, substitui o alvo por Tab e o clique para andar da issue #17.

## Limitações conhecidas

- Personagem, carros e objetos são provisórios, feitos de primitivas. A arte final entra como glTF (issue #15).
- Sem multiplayer ainda: o próximo passo é a sala Colyseus por cidade.
- Sem modo leve para celular fraco (desligar sombras e bloom).
