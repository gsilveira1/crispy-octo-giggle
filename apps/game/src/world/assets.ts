/** Formato de public/assets/assets.json, gerado por `pnpm assets`. */
export type AssetsManifest = {
  ground: { file: string; frameWidth: number; frameHeight: number; frames: string[] };
  avatar: { file: string; frameWidth: number; frameHeight: number; frames: number };
  buildings: Record<string, { wallLight: string; wallDark: string; roof: string }>;
};

export const hexToNumber = (h: string) => parseInt(h.replace("#", ""), 16);
