import { z } from "zod";

export const Quest = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  giverNpcId: z.string().optional(),
  requiredLevel: z.number().int().min(1).default(1),
  rewardXp: z.number().int().min(0).default(0),
});
export type Quest = z.infer<typeof Quest>;

export const StoryChapter = z.object({
  id: z.string(),
  order: z.number().int().min(0),
  title: z.string(),
  lore: z.string(),
  cityIds: z.array(z.string()).default([]),
  quests: z.array(Quest).default([]),
});
export type StoryChapter = z.infer<typeof StoryChapter>;
