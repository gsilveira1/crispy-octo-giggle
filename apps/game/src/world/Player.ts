import Phaser from "phaser";
import { tileToScreen, type Point } from "@bigriver/shared";

/** Metros de jogo por segundo andando (GameRules.playerSpeedMetersPerSecond). */
const WALK_MPS = 4;
const RUN_FACTOR = 2.5;

/**
 * Personagem local (sem servidor ainda). Anda em coordenadas de tile e colide com
 * prédios e água. As teclas seguem a tela: W sobe, S desce, A esquerda, D direita.
 */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  tile: Point;
  private keys: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d" | "shift", Phaser.Input.Keyboard.Key>;
  private walkTime = 0;

  constructor(
    scene: Phaser.Scene,
    spawn: Point,
    private metersPerTile: number,
    private isBlocked: (c: number, r: number) => boolean,
  ) {
    this.tile = [...spawn];
    this.sprite = scene.add.sprite(0, 0, "avatar", 0).setOrigin(0.5, 1);
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP), down: kb.addKey(K.DOWN), left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
      w: kb.addKey(K.W), a: kb.addKey(K.A), s: kb.addKey(K.S), d: kb.addKey(K.D), shift: kb.addKey(K.SHIFT),
    };
    this.place();
  }

  /** Direção pedida na tela, normalizada. Também aceita um vetor externo (toque/clique). */
  update(dtMs: number, external?: Point) {
    const k = this.keys;
    let sx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let sy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (external && sx === 0 && sy === 0) [sx, sy] = external;
    const len = Math.hypot(sx, sy);
    if (len === 0) {
      this.sprite.setFrame(0);
      this.walkTime = 0;
      return;
    }
    sx /= len;
    sy /= len;
    // Direção da tela → direção em tiles. Na tela um tile anda (32, 16) por coluna e (−32, 16) por linha;
    // normalizamos para a velocidade ser a mesma em metros em qualquer direção.
    let dc = sx / 2 + sy;
    let dr = -sx / 2 + sy;
    const dl = Math.hypot(dc, dr);
    dc /= dl;
    dr /= dl;
    const speedTiles = (WALK_MPS * (k.shift.isDown ? RUN_FACTOR : 1)) / this.metersPerTile;
    const step = (speedTiles * dtMs) / 1000;
    const [c, r] = this.tile;
    // Desliza na parede: tenta os dois eixos separados.
    const nc = c + dc * step;
    const nr = r + dr * step;
    if (!this.isBlocked(nc, r)) this.tile[0] = nc;
    if (!this.isBlocked(this.tile[0], nr)) this.tile[1] = nr;
    if (sx !== 0) this.sprite.setFlipX(sx < 0);
    this.walkTime += dtMs;
    this.sprite.setFrame(1 + (Math.floor(this.walkTime / 140) % 2));
    this.place();
  }

  get screen(): Point {
    return tileToScreen(this.tile);
  }

  private place() {
    const [x, y] = this.screen;
    this.sprite.setPosition(x, y).setDepth(y);
  }
}
