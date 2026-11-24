import Phaser from "phaser";
import { TILE_H, TILE_W, tileToScreen, type TileManifest } from "@bigriver/shared";
import type { AssetsManifest } from "../world/assets";
import { ChunkManager } from "../world/ChunkManager";
import { Player } from "../world/Player";

export type WorldInfo = { name: string; tile: [number, number]; chunks: number; street?: string; attribution: string[] };

export class WorldScene extends Phaser.Scene {
  private city!: string;
  private manifest!: TileManifest;
  private assetsManifest!: AssetsManifest;
  private chunks!: ChunkManager;
  private player?: Player;
  private labels: Phaser.GameObjects.Text[] = [];
  private pointerDir?: [number, number];

  constructor() {
    super("world");
  }

  init(data: { city: string }) {
    this.city = data.city;
  }

  preload() {
    this.load.json("assets", "assets/assets.json");
    this.load.json("manifest", `maps/${this.city}/manifest.json`);
    this.load.spritesheet("ground", "assets/ground.png", { frameWidth: TILE_W, frameHeight: TILE_H });
    this.load.spritesheet("avatar", "assets/avatar.png", { frameWidth: 32, frameHeight: 48 });
  }

  async create() {
    this.manifest = this.cache.json.get("manifest") as TileManifest;
    this.assetsManifest = this.cache.json.get("assets") as AssetsManifest;
    this.chunks = new ChunkManager(this, this.manifest, `maps/${this.city}`, this.assetsManifest);

    const cam = this.cameras.main;
    cam.setZoom(1);
    const [sx, sy] = tileToScreen(this.manifest.spawn);
    cam.centerOn(sx, sy);
    await this.chunks.preload(...this.manifest.spawn);

    this.player = new Player(this, this.manifest.spawn, this.manifest.metersPerTile, (c, r) => this.chunks.isBlocked(c, r));
    cam.startFollow(this.player.sprite, false, 0.15, 0.15);

    this.addLabels();
    this.setupZoomAndTouch();
    this.scene.launch("hud");
    this.events.emit("ready");
  }

  update() {
    if (!this.player) return;
    // O delta suavizado do Phaser trava em 16 ms quando o quadro demora; usamos o tempo real (até 100 ms)
    // para a velocidade em metros por segundo não depender do FPS.
    const dt = Math.min(this.game.loop.rawDelta, 100);
    this.player.update(dt, this.pointerDir);
    this.chunks.update(this.cameras.main.worldView);
    this.fadeOccluders();
    const z = this.cameras.main.zoom;
    for (const l of this.labels) l.setVisible(z >= 0.6);
  }

  get info(): WorldInfo {
    const t = this.player?.tile ?? this.manifest.spawn;
    return {
      name: this.manifest.name,
      tile: [Math.floor(t[0]), Math.floor(t[1])],
      chunks: this.chunks.loadedCount,
      street: this.nearestStreet(t),
      attribution: this.manifest.attribution,
    };
  }

  /** Prédios na frente do jogador ficam translúcidos para ele não sumir. */
  private fadeOccluders() {
    const p = this.player!;
    const [px, py] = p.screen;
    for (const b of this.chunks.buildings) {
      const covers = b.depth > py && b.bounds.contains(px, py - 20) && b.covers(px, py - 20);
      b.gfx.setAlpha(covers ? 0.35 : 1);
    }
  }

  private nearestStreet([c, r]: [number, number]): string | undefined {
    let best: string | undefined;
    let bestD = 8;
    for (const s of this.manifest.streets)
      for (const [pc, pr] of s.points) {
        const d = Math.hypot(pc - c, pr - r);
        if (d < bestD) [best, bestD] = [s.name, d];
      }
    return best;
  }

  private addLabels() {
    const style = { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#222", stroke: "#ffffff", strokeThickness: 3 };
    for (const p of this.manifest.pois) {
      if (!p.name || !["civic", "religious", "education", "leisure", "health"].includes(p.category)) continue;
      const [x, y] = tileToScreen(p.tile);
      this.labels.push(this.add.text(x, y - 40, p.name, { ...style, fontStyle: "bold" }).setOrigin(0.5, 1).setDepth(1e9));
    }
    for (const s of this.manifest.streets) {
      const [x, y] = tileToScreen(s.tile);
      this.labels.push(this.add.text(x, y, s.name, { ...style, fontSize: "11px", color: "#444" }).setOrigin(0.5).setDepth(1e9 - 1).setAlpha(0.85));
    }
  }

  private setupZoomAndTouch() {
    const cam = this.cameras.main;
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 2.5));
    });
    // Segurar o clique/toque anda na direção do ponteiro (celular sem teclado).
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => (this.pointerDir = this.dirTo(p)));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => p.isDown && (this.pointerDir = this.dirTo(p)));
    this.input.on("pointerup", () => (this.pointerDir = undefined));
  }

  private dirTo(p: Phaser.Input.Pointer): [number, number] {
    const [px, py] = this.player!.screen;
    const dx = p.worldX - px;
    const dy = p.worldY - (py - 24);
    const l = Math.hypot(dx, dy);
    return l < 8 ? [0, 0] : [dx / l, dy / l];
  }
}
