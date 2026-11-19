// packages/contracts/src/stack-pack/manifest.ts
//
// M14 stack pack manifest (M14-01, M14-02). Each stack pack declares its
// compatibility, the skills/references/templates/scripts/policies it
// provides, and the conventions it imposes.

import { z } from 'zod';

export const STACK_PACK_MANIFEST_SCHEMA_VERSION = 1 as const;

export const StackPackManifestSchema = z.object({
  schemaVersion: z.literal(STACK_PACK_MANIFEST_SCHEMA_VERSION),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'stack id must be kebab-case'),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  // The stacks this pack covers (e.g., ["node-typescript"]).
  stacks: z.array(z.string()).min(1),
  // Required kit compatibility.
  kitCompatibility: z.string().min(1),
  // Skills this pack provides (relative paths within the pack).
  skills: z.array(z.string()).default([]),
  // Reference documents (markdown).
  references: z.array(z.string()).default([]),
  // Project templates this pack provides.
  templates: z.array(z.string()).default([]),
  // Deterministic scripts (lint, test, build, typecheck commands).
  scripts: z
    .array(
      z.object({
        name: z.string(),
        command: z.array(z.string().min(1)).min(1),
        description: z.string(),
      }),
    )
    .default([]),
  // Stack-specific policies (e.g., "always use service objects in Rails").
  policies: z.array(z.string()).default([]),
  // Whether this pack depends on another pack.
  dependsOn: z.array(z.string()).default([]),
});

export type StackPackManifest = z.infer<typeof StackPackManifestSchema>;

/**
 * Skill loading rules (M14-02). How the kit discovers and loads
 * stack-specific skills.
 */
export const SkillLoadingRuleSchema = z.object({
  // The skill name to load.
  skill: z.string().min(1),
  // The stacks that should load this skill.
  appliesToStacks: z.array(z.string()),
  // The trigger that loads the skill (on-demand vs always-loaded).
  trigger: z.enum(['on-demand', 'always-loaded']).default('on-demand'),
  // The path within the pack where the skill lives.
  path: z.string().min(1),
});

export type SkillLoadingRule = z.infer<typeof SkillLoadingRuleSchema>;
