// packages/contracts/src/learning/engineering-memory.ts
//
// M29 hierarchical engineering memory (RESEARCH.md §4). Four levels:
//   1. Episodic — what happened (individual runs).
//   2. Semantic — what we know (verified facts, conventions).
//   3. Procedural — how to do it (Skills, recipes, strategies).
//   4. Meta — how to learn (relevance, staleness, retrieval strategy).
//
// Memory scope (RESEARCH.md §10): project, organization, global. Private
// application code or organization-specific information must not be merged
// into a public knowledge base without explicit contribution permissions.

import { z } from 'zod';

export const MEMORY_SCOPE_SCHEMA_VERSION = 1 as const;

export const MemoryLevelSchema = z.enum(['episodic', 'semantic', 'procedural', 'meta']);
export const MemoryScopeSchema = z.enum(['project', 'organization', 'global']);

export const EngineeringMemoryEntrySchema = z.object({
  schemaVersion: z.literal(MEMORY_SCOPE_SCHEMA_VERSION),
  id: z.string(),
  level: MemoryLevelSchema,
  scope: MemoryScopeSchema,
  // The scope identifier (project id, organization id, or "global").
  scopeId: z.string().min(1),
  // A short title for retrieval.
  title: z.string().min(1),
  // The memory content (markdown).
  content: z.string().min(1),
  // Provenance: where this memory came from.
  source: z.object({
    // The episode(s) this memory was derived from.
    episodeIds: z.array(z.string()).default([]),
    // Whether this was automatically derived or manually contributed.
    derivation: z.enum(['automatic', 'manual', 'approved-pr']),
  }),
  // Confidence (0.0 to 1.0); must be supported by evidence.
  confidence: z.number().min(0).max(1),
  // When this memory was created and last validated.
  createdAt: z.string(),
  lastValidatedAt: z.string().optional(),
  // When this memory expires (staleness horizon).
  expiresAt: z.string().optional(),
  // Tags for retrieval.
  tags: z.array(z.string()).default([]),
});

export type MemoryLevel = z.infer<typeof MemoryLevelSchema>;
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type EngineeringMemoryEntry = z.infer<typeof EngineeringMemoryEntrySchema>;
