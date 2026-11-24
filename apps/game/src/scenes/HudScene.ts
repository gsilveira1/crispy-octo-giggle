import Phaser from "phaser";
import type { WorldScene } from "./WorldScene";

/** Interface fixa na tela (não segue o zoom da câmera do mundo). */
export class HudScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private where!: Phaser.GameObjects.Text;
  private credit!: Phaser.GameObjects.Text;

  constructor() {
    super("hud");
  }

  create() {
    const box = { fontFamily: "system-ui, sans-serif", color: "#fff", backgroundColor: "#00000088", padding: { x: 10, y: 6 } };
    this.title = this.add.text(12, 12, "", { ...box, fontSize: "16px", fontStyle: "bold" });
    this.where = this.add.text(12, 46, "", { ...box, fontSize: "13px" });
    this.add.text(12, 0, "WASD ou setas: andar · Shift: correr · roda do mouse: zoom · clique e segure: andar até o ponteiro", { ...box, fontSize: "12px" })
      .setName("help");
    this.credit = this.add.text(0, 0, "", { ...box, fontSize: "11px", backgroundColor: "#ffffffcc", color: "#333" }).setOrigin(1, 1);
    this.layout();
    this.scale.on("resize", () => this.layout());
  }

  update() {
    const world = this.scene.get("world") as WorldScene;
    const info = world.info;
    this.title.setText(`Big River · ${info.name}`);
    this.where.setText(`${info.street ?? "—"}   ·   tile ${info.tile[0]}, ${info.tile[1]}   ·   chunks ${info.chunks}`);
    this.credit.setText(info.attribution.join(" · "));
  }

  private layout() {
    const { width, height } = this.scale;
    this.credit.setPosition(width - 8, height - 8);
    (this.children.getByName("help") as Phaser.GameObjects.Text).setPosition(12, height - 40);
  }
}
