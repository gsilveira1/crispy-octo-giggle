import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { AVATAR_SHEET, BUILDING_PALETTE, GROUND_COLORS, GROUND_SHEET } from "./spec.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/game/public/assets");

type RGBA = [number, number, number, number];
const hex = (h: string, a = 255): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const shade = ([r, g, b, a]: RGBA, k: number): RGBA => [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), a];

/** Ruído determinístico para a textura não ficar chapada. */
function noise(x: number, y: number, seed: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function put(png: PNG, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function groundSheet(): PNG {
  const { frameWidth: w, frameHeight: h, frames } = GROUND_SHEET;
  const png = new PNG({ width: w * frames.length, height: h });
  frames.forEach((type, f) => {
    const base = hex(GROUND_COLORS[type][0]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // Losango: |x − w/2|/(w/2) + |y − h/2|/(h/2) ≤ 1, com meio pixel de folga para os tiles encostarem.
        const d = Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2);
        if (d > 1.02) continue;
        // Borda bem sutil: o chão fica contínuo, sem cara de quadriculado.
        let c = d > 0.95 ? shade(base, 0.985) : shade(base, 0.96 + noise(x, y, f) * 0.08);
        if (type === "water" && noise(Math.floor(x / 6), y, f) > 0.93) c = shade(base, 1.15);
        if (type === "forest" && noise(Math.floor(x / 3), Math.floor(y / 2), f) > 0.8) c = shade(base, 0.8);
        if (type === "rail" && (Math.abs(x - y * 2 - 8) < 2 || Math.abs(x - y * 2 + 8) < 2) && d < 0.9) c = hex("#9a9a9a");
        put(png, f * w + x, y, c);
      }
  });
  return png;
}

function avatarSheet(): PNG {
  const { frameWidth: w, frameHeight: h, frames } = AVATAR_SHEET;
  const png = new PNG({ width: w * frames, height: h });
  const skin = hex("#e0b48c");
  const shirt = hex("#2f6db5");
  const pants = hex("#3a3a46");
  const shadow: RGBA = [0, 0, 0, 70];
  for (let f = 0; f < frames; f++) {
    const ox = f * w;
    const step = f === 0 ? 0 : f === 1 ? 2 : -2;
    const fill = (x0: number, y0: number, x1: number, y1: number, c: RGBA) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(png, ox + x, y, c);
    };
    // Sombra elíptica no pé.
    for (let y = 40; y < 48; y++) for (let x = 4; x < 28; x++) if (((x - 16) / 12) ** 2 + ((y - 44) / 4) ** 2 <= 1) put(png, ox + x, y, shadow);
    fill(11 + step, 32, 15 + step, 44, pants); // perna esquerda
    fill(17 - step, 32, 21 - step, 44, pants); // perna direita
    fill(9, 18, 23, 33, shirt); // tronco
    fill(6, 19, 9, 30, skin); // braço
    fill(23, 19, 26, 30, skin);
    for (let y = 4; y < 18; y++) for (let x = 9; x < 23; x++) if (((x - 16) / 7) ** 2 + ((y - 11) / 7) ** 2 <= 1) put(png, ox + x, y, skin);
    fill(9, 3, 23, 8, hex("#4a3422")); // cabelo
  }
  return png;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, GROUND_SHEET.file), PNG.sync.write(groundSheet()));
  await writeFile(join(OUT, AVATAR_SHEET.file), PNG.sync.write(avatarSheet()));
  await writeFile(
    join(OUT, "assets.json"),
    JSON.stringify({ ground: { ...GROUND_SHEET, frames: [...GROUND_SHEET.frames] }, avatar: AVATAR_SHEET, buildings: BUILDING_PALETTE }, null, 2) + "\n",
  );
  console.log(`Assets provisórios gerados em ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
