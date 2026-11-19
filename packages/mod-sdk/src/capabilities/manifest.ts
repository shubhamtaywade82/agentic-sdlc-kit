// packages/mod-sdk/src/capabilities/manifest.ts
//
// Mod capability manifest (RESEARCH.md §9). Every Mod declares its
// capabilities so the installer (M15) and validator can inspect them
// before enabling the Mod.
//
// This is the SDK's own policy model, NOT a replacement for Claude Code's
// plugin manifest. It gives the installer, validator, and security auditor
// a consistent contract to inspect before a Mod is enabled.

import { z } from 'zod';

export const ModCapabilitiesSchema = z.object({
  // The Mod's unique id (kebab-case).
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  // Event names this Mod registers handlers for.
  hooks: z.array(z.string()),
  // Mods API namespaces the Mod calls (e.g., ["ui.log", "fs.read"]).
  apiAccess: z.array(z.string()),
  // Filesystem paths or path patterns the Mod reads or writes.
  filesystemAccess: z.array(z.string()),
  // Whether the Mod makes network requests.
  networkAccess: z.boolean().default(false),
  // Whether the Mod spawns processes.
  processExecution: z.boolean().default(false),
  // Whether the Mod modifies submitted prompts or context.
  modifiesPrompts: z.boolean().default(false),
  // Whether the Mod modifies tool calls or arguments.
  modifiesToolCalls: z.boolean().default(false),
  // Whether the Mod changes model selection or effort.
  modifiesModels: z.boolean().default(false),
  // The autonomy level this Mod is allowed to operate at (for learning
  // Mods; non-learning Mods default to L0 — collect evidence only).
  learningAutonomyLevel: z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']).default('L0'),
});

export type ModCapabilities = z.infer<typeof ModCapabilitiesSchema>;
