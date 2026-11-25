# 0002 · Cliente em 3D com Three.js

Data: 2026-11-25 · Status: aceita

## Contexto

O alvo de estética e jogabilidade passou a ser o jogo do perfil `lastmaglab` (Instagram). O que dá a cara daquele jogo:

- câmera em perspectiva, quase de cima (uns 60° a 70°), perto do personagem;
- noite azulada com luzes quentes pontuais (postes, fogo), sombras reais e brilho (bloom);
- chão de concreto com faixas e textos pintados, cheio de objetos (caixas, barris, cercas);
- explosões, faíscas, fumaça e objetos com física.

Luz e sombra dinâmicas desse tipo só ficam iguais em 3D de verdade. O cliente 2D isométrico (Phaser 4, ADR 0001 e issue #9) não chega lá.

## Decisão

O cliente do jogo passa a ser **3D em Three.js**, com câmera inclinada de cima que segue o jogador. A escolha foi do dono do projeto em 2026-11-25.

O resto do ADR 0001 continua: servidor Colyseus, Postgres + PostGIS, admin em React + Vite + MapLibre, e os mesmos mapas gerados por `pnpm city build` (chunks de 64×64 tiles com chão e contornos de prédios).

## Consequências

- Os prédios saem direto do contorno real, extrudados em 3D. Não precisamos mais renderizar sprites isométricos em 8 direções (issue #15): os modelos 3D (personagens, marcos) entram como glTF.
- A atmosfera escura combina com a Cerração (névoa, mais escuro quanto mais fundo).
- O cliente Phaser fica em `apps/game/2d.html` só para comparação e sai quando o 3D cobrir tudo.
- Custo: mais exigente de GPU que o 2D. Celular fraco pode precisar de um modo leve (sem sombras e sem bloom).
