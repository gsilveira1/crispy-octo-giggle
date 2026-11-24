import Phaser from "phaser";
import { HudScene } from "./scenes/HudScene";
import { WorldScene } from "./scenes/WorldScene";

const city = new URLSearchParams(location.search).get("city") ?? "taquara";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#cfc8b8",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, roundPixels: false },
  scene: [],
});

game.scene.add("world", WorldScene, true, { city });
game.scene.add("hud", HudScene, false);

// Exposto para testes automatizados e depuração no console.
(window as unknown as { __game: Phaser.Game }).__game = game;
