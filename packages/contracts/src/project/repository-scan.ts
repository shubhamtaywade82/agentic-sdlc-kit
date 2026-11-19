// packages/contracts/src/project/repository-scan.ts
//
// RepositoryScan: the read-only output of inspecting a target repository.
// Declared in M1; produced by core.discovery in M2.
//
// Scanning is read-only. The scanner MUST NOT execute any discovered
// script. See docs/security/SECURITY.md §1 and ADR-0009.

import { z } from "zod";

export const GitStateSchema = z.object({
  branch: z.string().min(1),
  dirty: z.boolean(),
  headSha: z.string().regex(/^[0-9a-f]{40}$/, "headSha must be a 40-char SHA-1"),
});

export const RepositoryScanSchema = z.object({
  root: z.string().min(1),
  detectedStacks: z.array(z.string()),
  packageManagers: z.array(z.string()),
  entryPoints: z.array(z.string()),
  testFrameworks: z.array(z.string()),
  hasMigrations: z.boolean(),
  hasCi: z.boolean(),
  agentInstructionFiles: z.array(z.string()),
  git: GitStateSchema,
});

export type RepositoryScan = z.infer<typeof RepositoryScanSchema>;
export type GitState = z.infer<typeof GitStateSchema>;
