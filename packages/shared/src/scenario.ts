import { z } from "zod";

/**
 * Cenário montado à mão por cima do mapa gerado do OSM: objetos, bandos de crias,
 * sobreviventes, luzes e refúgio. O builder de cenário do jogo exporta este JSON;
 * o admin (issue #10) vai guardar e publicar a versão aprovada para o servidor.
 * Coordenadas em metros do mundo do jogo (x = leste, z = sul), rot em radianos.
 */
export const SCENARIO_ITEM_KINDS = ["crate", "barrel", "barrier", "car", "tree", "lamp", "fire", "pack", "survivor", "refuge"] as const;
export const ScenarioItemKind = z.enum(SCENARIO_ITEM_KINDS);
export type ScenarioItemKind = z.infer<typeof ScenarioItemKind>;

export const ScenarioItem = z.object({
  id: z.string(),
  kind: ScenarioItemKind,
  x: z.number(),
  z: z.number(),
  rot: z.number().default(0),
  /** Bando: quantas crias. */
  count: z.number().int().min(1).max(12).optional(),
  /** Sobrevivente: id do modelo (npc-padre, ...). Carro: cor. */
  model: z.string().optional(),
  color: z.string().optional(),
  label: z.string().optional(),
});
export type ScenarioItem = z.infer<typeof ScenarioItem>;

export const Scenario = z.object({
  version: z.literal(1),
  city: z.string(),
  name: z.string().default("Cenário"),
  updatedAt: z.number(),
  items: z.array(ScenarioItem),
});
export type Scenario = z.infer<typeof Scenario>;
