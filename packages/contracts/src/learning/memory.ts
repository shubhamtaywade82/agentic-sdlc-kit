// packages/contracts/src/learning/memory.ts
//
// M29 Hierarchical Memory contracts: episodic, semantic, and procedural memories
// derived from accumulated engineering experience.

import { z } from "zod";

export const MemoryTypeSchema = z.enum(["episodic", "semantic", "procedural"]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemoryEntrySchema = z.object({
  id: z.string().min(1),
  type: MemoryTypeSchema,
  domain: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string()),
  appliedCount: z.number().int().nonnegative().default(0),
  successCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
