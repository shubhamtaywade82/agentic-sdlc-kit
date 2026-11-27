// packages/contracts/src/agent-tools/index.ts
//
// Typed tool surface for an agent host (item 4). A host calls these tools
// instead of shelling out. Each input schema is strict: an unrecognized key is
// an error, so no tool can carry a command. A phase runs only the verification
// command the plan declares for its task.

import { z } from 'zod';

export const AGENT_TOOL_NAMES = ['kit_next', 'kit_phase', 'kit_status'] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const KitNextInputSchema = z.object({ featureId: z.string().min(1) }).strict();
export type KitNextInput = z.infer<typeof KitNextInputSchema>;

export const KitPhaseInputSchema = z
  .object({
    featureId: z.string().min(1),
    taskId: z.string().min(1),
    phase: z.enum(['red', 'green', 'refactor']),
  })
  .strict();
export type KitPhaseInput = z.infer<typeof KitPhaseInputSchema>;

export const KitStatusInputSchema = z.object({ featureId: z.string().min(1) }).strict();
export type KitStatusInput = z.infer<typeof KitStatusInputSchema>;
