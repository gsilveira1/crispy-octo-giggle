import { z } from "zod";
import { LngLat } from "./geo.js";

export const NpcRole = z.enum(["merchant", "quest_giver", "guard", "enemy", "ambient"]);

export const Npc = z.object({
  id: z.string(),
  cityId: z.string(),
  name: z.string(),
  role: NpcRole,
  position: LngLat,
  dialogueId: z.string().optional(),
  level: z.number().int().min(1).default(1),
});
export type Npc = z.infer<typeof Npc>;
