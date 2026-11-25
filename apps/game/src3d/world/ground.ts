import * as THREE from "three";
import { Ground, type Point } from "@bigriver/shared";
import { canvas, canvasTexture, hash } from "./util";

/** Pixels de textura por tile. */
const PX = 16;

/** Cor de base de cada tipo de chão, já pensada para a noite da Cerração (a luz escurece mais). */
const COLORS: Record<number, string> = {
  [Ground.ground]: "#77736c",
  [Ground.grass]: "#3f5a36",
  [Ground.forest]: "#2e4429",
  [Ground.water]: "#1d3442",
  [Ground.road_major]: "#3b3d42",
  [Ground.road_minor]: "#46484c",
  [Ground.path]: "#7d705d",
  [Ground.rail]: "#4b4038",
  [Ground.plaza]: "#837d73",
  [Ground.farmland]: "#5c5738",
  [Ground.lot]: "#5a5651",
};
/** Asfalto e água ficam brilhantes (molhados); o resto é fosco. */
const ROUGH: Record<number, number> = { [Ground.road_major]: 0.38, [Ground.road_minor]: 0.55, [Ground.water]: 0.15 };

let cobble: THREE.Texture | undefined;
/** Paralelepípedo de basalto (2 m × 2 m, repetível), multiplicado sobre a cor das ruas menores. */
function cobbleTexture(): THREE.Texture {
  if (cobble) return cobble;
  const S = 256;
  const [cv, g] = canvas(S, S);
  g.fillStyle = "#1c1c1c";
  g.fillRect(0, 0, S, S);
  const rows = 14;
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -hash(r, 1) * 20;
    while (x < S) {
      const w = h * (1.2 + hash(r, Math.round(x), 2) * 0.8);
      const v = 0.45 + hash(r, Math.round(x), 3) * 0.25;
      g.fillStyle = `rgb(${v * 255},${v * 250},${v * 245})`;
      g.beginPath();
      g.roundRect(x + 1.5, r * h + 1.5, w - 3, h - 3, 3);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.1)";
      g.fillRect(x + 3, r * h + 2.5, w - 7, 2);
      x += w;
    }
  }
  cobble = canvasTexture(cv, false, true);
  return cobble;
}

export const isRoad = (g: number | undefined) => g === Ground.road_major || g === Ground.road_minor;

/**
 * Textura do chão de um chunk: cor por tile, placas de concreto nas calçadas, meio-fio onde a rua
 * encontra a calçada, faixa amarela tracejada no eixo das ruas com nome e sujeira espalhada.
 */
export function groundMaterial(
  ground: Uint8Array,
  size: number,
  origin: Point,
  streets: { points: Point[] }[],
): THREE.MeshStandardMaterial {
  const W = size * PX;
  const [cv, g] = canvas(W, W);
  const [rv, rg] = canvas(W / 4, W / 4);
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= size || r >= size ? undefined : ground[r * size + c]);

  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const t = ground[r * size + c]!;
      const x = c * PX;
      const y = r * PX;
      g.fillStyle = COLORS[t] ?? COLORS[Ground.ground]!;
      g.fillRect(x, y, PX, PX);
      // Variação leve por tile para o chão não ficar chapado.
      const v = hash(c + origin[0], r + origin[1], 1);
      g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.06})` : `rgba(0,0,0,${(0.5 - v) * 0.1})`;
      g.fillRect(x, y, PX, PX);
      if (t === Ground.ground || t === Ground.plaza || t === Ground.lot) {
        // Juntas das placas de concreto (uma placa por tile = 2 m).
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(x, y, PX, 1);
        g.fillRect(x, y, 1, PX);
      }
      if (t === Ground.rail) {
        g.fillStyle = "#2b241f";
        for (let i = 2; i < PX; i += 5) g.fillRect(x, y + i, PX, 2);
      }
      if (t === Ground.forest && v > 0.4) {
        g.fillStyle = "rgba(10,25,10,0.5)";
        g.beginPath();
        g.arc(x + PX / 2, y + PX / 2, PX * 0.6, 0, Math.PI * 2);
        g.fill();
      }
      // Meio-fio: borda clara no lado da calçada que encosta na rua.
      if (!isRoad(t) && t !== Ground.water) {
        g.fillStyle = "#9b968c";
        if (isRoad(at(c, r - 1))) g.fillRect(x, y, PX, 2);
        if (isRoad(at(c, r + 1))) g.fillRect(x, y + PX - 2, PX, 2);
        if (isRoad(at(c - 1, r))) g.fillRect(x, y, 2, PX);
        if (isRoad(at(c + 1, r))) g.fillRect(x + PX - 2, y, 2, PX);
      }
      // Boca de lobo (bueiro) no asfalto junto ao meio-fio.
      if (isRoad(t) && v > 0.93) {
        g.fillStyle = "#1a1b1d";
        if (!isRoad(at(c, r - 1))) g.fillRect(x + 4, y + 1, 8, 3);
        else if (!isRoad(at(c - 1, r))) g.fillRect(x + 1, y + 4, 3, 8);
      }
      // Azul = máscara do paralelepípedo (ruas menores), usada no shader de detalhe.
      rg.fillStyle = `rgb(${Math.round((ROUGH[t] ?? 0.92) * 255)},${Math.round((ROUGH[t] ?? 0.92) * 255)},${t === Ground.road_minor ? 255 : 0})`;
      rg.fillRect(c * (PX / 4), r * (PX / 4), PX / 4, PX / 4);
    }

  // Granulado do asfalto e do concreto.
  for (let i = 0; i < W * W * 0.012; i++) {
    const x = hash(i, origin[0], 2) * W;
    const y = hash(i, origin[1], 3) * W;
    g.fillStyle = hash(i, 7, 4) > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.18)";
    g.fillRect(x, y, 1, 1);
  }

  // Faixa amarela tracejada no eixo das ruas com nome, recortada para só aparecer no asfalto.
  const [lv, lg] = canvas(W, W);
  lg.save();
  lg.translate(-origin[0] * PX, -origin[1] * PX);
  lg.strokeStyle = "rgba(214,170,64,0.8)";
  lg.lineWidth = 1.6;
  lg.setLineDash([PX * 1.5, PX * 1.5]);
  for (const s of streets) {
    lg.beginPath();
    let prev: Point | undefined;
    for (const p of s.points) {
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 6) lg.lineTo((p[0] + 0.5) * PX, (p[1] + 0.5) * PX);
      else lg.moveTo((p[0] + 0.5) * PX, (p[1] + 0.5) * PX);
      prev = p;
    }
    lg.stroke();
  }
  lg.restore();
  lg.globalCompositeOperation = "destination-in";
  lg.fillStyle = "#000";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (isRoad(ground[r * size + c]) && isRoad(at(c - 1, r)) && isRoad(at(c + 1, r)) && isRoad(at(c, r - 1)) && isRoad(at(c, r + 1))) lg.fillRect(c * PX, r * PX, PX, PX);
  g.drawImage(lv, 0, 0);

  // Manchas de sujeira e umidade.
  for (let i = 0; i < 90; i++) {
    const x = hash(i, origin[0] + 11, 5) * W;
    const y = hash(i, origin[1] + 13, 6) * W;
    const rad = 10 + hash(i, 3, 7) * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(10,12,14,0.35)");
    grad.addColorStop(1, "rgba(10,12,14,0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  const map = canvasTexture(cv);
  const roughnessMap = canvasTexture(rv, false);
  roughnessMap.magFilter = THREE.LinearFilter;
  // O canal verde guarda a rugosidade (convenção do three.js); o azul marca onde vai paralelepípedo.
  const m = new THREE.MeshStandardMaterial({ map, roughnessMap, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.cobble = { value: cobbleTexture() };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCobbleUv;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvCobbleUv = (modelMatrix * vec4(transformed, 1.0)).xz / 2.0;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCobbleUv;\nuniform sampler2D cobble;")
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        float cobbleMask = texture2D(roughnessMap, vRoughnessMapUv).b;
        vec3 cb = texture2D(cobble, vCobbleUv).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * cb * 1.9, cobbleMask);
        roughnessFactor = mix(roughnessFactor, 0.35 + (1.0 - cb.r) * 0.6, cobbleMask);`,
      );
  };
  return m;
}
