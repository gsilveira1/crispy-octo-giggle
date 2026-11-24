import { z } from "zod";

/** Global, admin-editable game rules. */
export const GameRules = z.object({
  maxLevel: z.number().int().min(1).default(50),
  xpCurve: z.enum(["linear", "quadratic", "exponential"]).default("quadratic"),
  playerSpeedMetersPerSecond: z.number().positive().default(4),
  pvpEnabled: z.boolean().default(false),
  respawnSeconds: z.number().int().min(0).default(10),
});
export type GameRules = z.infer<typeof GameRules>;
