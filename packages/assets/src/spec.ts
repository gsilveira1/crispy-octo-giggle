import { GROUND_TYPES, TILE_H, TILE_W, type GroundType } from "@bigriver/shared";

/**
 * Contrato dos assets: quem desenhar a arte final deve manter estes tamanhos e
 * a ordem dos frames. O cliente só depende disto.
 */
export const GROUND_SHEET = {
  file: "ground.png",
  frameWidth: TILE_W,
  frameHeight: TILE_H,
  /** Um frame por tipo de chão, na ordem de GROUND_TYPES, da esquerda para a direita. */
  frames: GROUND_TYPES,
};

export const AVATAR_SHEET = {
  file: "avatar.png",
  frameWidth: 32,
  frameHeight: 48,
  /** Frames: 0 parado, 1–2 andando. O pé fica no centro da base do frame. */
  frames: 3,
};

/** Cores provisórias do chão: [base, borda]. */
export const GROUND_COLORS: Record<GroundType, [string, string]> = {
  ground: ["#d9d1c3", "#c9c0b0"],
  grass: ["#8cc26e", "#78ad5c"],
  forest: ["#4f8a45", "#437a3a"],
  water: ["#5aa5d6", "#4b93c4"],
  road_major: ["#6b6b70", "#5d5d62"],
  road_minor: ["#8a8a8e", "#7b7b80"],
  path: ["#c8b79a", "#b8a789"],
  rail: ["#7d6a58", "#6c5a49"],
  plaza: ["#e6dccb", "#d6cbb8"],
  farmland: ["#d8cf8f", "#c8be7c"],
  lot: ["#cfc6b6", "#bfb6a5"],
};

/** Cores provisórias dos prédios por tipo OSM: parede clara, parede escura, telhado. */
export const BUILDING_PALETTE: Record<string, { wallLight: string; wallDark: string; roof: string }> = {
  default: { wallLight: "#efe6d6", wallDark: "#cdbfa8", roof: "#b5523b" },
  house: { wallLight: "#f3e3c3", wallDark: "#d4bf98", roof: "#a9483a" },
  apartments: { wallLight: "#e7e3de", wallDark: "#bdb6ad", roof: "#8f8a84" },
  commercial: { wallLight: "#e9e0f0", wallDark: "#c2b6cf", roof: "#7f7a8a" },
  retail: { wallLight: "#f2dcd0", wallDark: "#d1b3a3", roof: "#8a7a72" },
  church: { wallLight: "#fbf7ea", wallDark: "#dcd3b9", roof: "#6d6f7a" },
  public: { wallLight: "#f6efd9", wallDark: "#d6caa8", roof: "#5f7a8a" },
  government: { wallLight: "#f6efd9", wallDark: "#d6caa8", roof: "#5f7a8a" },
  school: { wallLight: "#f4e7c6", wallDark: "#d6c59b", roof: "#9a5d3c" },
  industrial: { wallLight: "#d9dde0", wallDark: "#aeb4ba", roof: "#7c8590" },
  warehouse: { wallLight: "#d9dde0", wallDark: "#aeb4ba", roof: "#7c8590" },
};
