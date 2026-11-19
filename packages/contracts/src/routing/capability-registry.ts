// packages/contracts/src/routing/capability-registry.ts
//
// M12 model capability registry (M12-02). Declares what each model can do
// so the router can match required capabilities to available models.

import { z } from 'zod';

export const ModelCapabilitiesSchema = z.object({
  model: z.string().min(1),
  // Provider: anthropic, openai, etc.
  provider: z.string().min(1),
  // Max context window in tokens.
  maxContextTokens: z.number().int().positive(),
  // Supported effort levels.
  supportedEfforts: z.array(z.enum(['low', 'medium', 'high'])),
  // Capabilities (e.g., ["code-edit", "tool-use", "vision", "long-context"]).
  capabilities: z.array(z.string()),
  // Rough relative cost per 1M input tokens (illustrative; not authoritative).
  relativeCostPer1MIn: z.number().positive(),
  relativeCostPer1MOut: z.number().positive(),
  // Whether this model supports subagent spawning.
  supportsSubagents: z.boolean().default(true),
});

export const ModelCapabilityRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  models: z.array(ModelCapabilitiesSchema),
});

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
export type ModelCapabilityRegistry = z.infer<typeof ModelCapabilityRegistrySchema>;
