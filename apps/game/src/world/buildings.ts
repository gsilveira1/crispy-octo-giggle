import Phaser from "phaser";
import { LEVEL_PX, tileToScreen, type Point, type TileBuilding } from "@bigriver/shared";
import { hexToNumber, type AssetsManifest } from "./assets";

export type BuildingView = {
  data: TileBuilding;
  gfx: Phaser.GameObjects.Graphics;
  /** Retângulo na tela, para saber se o prédio tapa o jogador. */
  bounds: Phaser.Geom.Rectangle;
  depth: number;
  /** true se o ponto da tela cai dentro da silhueta do prédio (paredes ou telhado). */
  covers(x: number, y: number): boolean;
};

/**
 * Desenha um prédio provisório: paredes extrudadas a partir do contorno real e telhado plano.
 * Só as paredes viradas para a câmera (normal apontando para baixo na tela) são desenhadas.
 */
export function drawBuilding(scene: Phaser.Scene, b: TileBuilding, palette: AssetsManifest["buildings"]): BuildingView {
  const colors = palette[b.kind] ?? palette.default!;
  const h = b.levels * LEVEL_PX;
  const base = b.footprint.slice(0, -1).map((p) => tileToScreen(p as Point));
  // Orientação do polígono na tela para achar as normais externas.
  let area = 0;
  for (let i = 0; i < base.length; i++) {
    const [x1, y1] = base[i]!;
    const [x2, y2] = base[(i + 1) % base.length]!;
    area += x1 * y2 - x2 * y1;
  }
  const sign = area > 0 ? 1 : -1;

  const gfx = scene.add.graphics();
  const walls: { y: number; draw: () => void }[] = [];
  const shapes: Phaser.Geom.Polygon[] = [];
  for (let i = 0; i < base.length; i++) {
    const a = base[i]!;
    const c = base[(i + 1) % base.length]!;
    const nx = (c[1] - a[1]) * sign;
    const ny = -(c[0] - a[0]) * sign;
    if (ny <= 0) continue; // parede de costas
    const color = nx < 0 ? colors.wallLight : colors.wallDark;
    shapes.push(new Phaser.Geom.Polygon([a[0], a[1], c[0], c[1], c[0], c[1] - h, a[0], a[1] - h]));
    walls.push({
      y: (a[1] + c[1]) / 2,
      draw: () => {
        gfx.fillStyle(hexToNumber(color), 1);
        gfx.fillPoints([new Phaser.Math.Vector2(a[0], a[1]), new Phaser.Math.Vector2(c[0], c[1]), new Phaser.Math.Vector2(c[0], c[1] - h), new Phaser.Math.Vector2(a[0], a[1] - h)], true);
      },
    });
  }
  // Paredes de trás primeiro.
  walls.sort((p, q) => p.y - q.y).forEach((w) => w.draw());
  const roof = base.map(([x, y]) => new Phaser.Math.Vector2(x, y - h));
  gfx.fillStyle(hexToNumber(colors.roof), 1);
  gfx.fillPoints(roof, true);
  gfx.lineStyle(1, 0x000000, 0.25);
  gfx.strokePoints(roof, true);
  shapes.push(new Phaser.Geom.Polygon(roof.flatMap((v) => [v.x, v.y])));

  const xs = base.map((p) => p[0]);
  const ys = base.map((p) => p[1]);
  const maxY = Math.max(...ys);
  const bounds = new Phaser.Geom.Rectangle(Math.min(...xs), Math.min(...ys) - h, Math.max(...xs) - Math.min(...xs), maxY - Math.min(...ys) + h);
  gfx.setDepth(maxY);
  return { data: b, gfx, bounds, depth: maxY, covers: (x, y) => shapes.some((s) => s.contains(x, y)) };
}
