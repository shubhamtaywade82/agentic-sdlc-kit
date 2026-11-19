// packages/contracts/src/project/project-profile.ts
//
// ProjectProfile: the versioned per-repository configuration contract.
//
// Commands are argument arrays, never shell strings. The M6 executor runs
// them with shell: false. A string command is a contract violation.
//
// See docs/contracts/CONTRACTS.md §2 and ADR-0008.

import { z } from "zod";

/**
 * Schema version for the ProjectProfile contract. Bumped on breaking
// changes; requires an ADR and a migration function in
// core/artifacts/migrations/.
 */
export const PROJECT_PROFILE_SCHEMA_VERSION = 1 as const;

/**
 * A single command is an array of arguments. The executor MUST run with
 * shell: false. Empty arrays are rejected.
 */
export const CommandSchema = z
  .array(z.string().min(1))
  .min(1, "command must be a non-empty array of arguments");

export const CommandsMapSchema = z
  .object({
    test: z.array(CommandSchema).optional(),
    lint: z.array(CommandSchema).optional(),
    typecheck: z.array(CommandSchema).optional(),
    build: z.array(CommandSchema).optional(),
  })
  .strict();

export const ProjectProfileSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_PROFILE_SCHEMA_VERSION),
    name: z
      .string()
      .min(1)
      .max(128, "name must be 1-128 chars"),
    stack: z
      .array(
        z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z][a-z0-9-]*$/, "stack entry must be lowercase kebab-case"),
      )
      .min(1, "stack must contain at least one entry"),
    commands: CommandsMapSchema,
  })
  .strict();

export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

export type CommandsMap = z.infer<typeof CommandsMapSchema>;
export type Command = z.infer<typeof CommandSchema>;

/**
 * Convenience constructor: builds a profile and validates it. Throws
 * (programmer error) if invalid — production callers should use the schema
 * directly and surface a PROFILE_INVALID Result.
 */
export function makeProfile(input: Omit<ProjectProfile, "schemaVersion">): ProjectProfile {
  return ProjectProfileSchema.parse({ ...input, schemaVersion: PROJECT_PROFILE_SCHEMA_VERSION });
}
