// packages/contracts/src/verification/strength.ts
//
// Test-strength evidence contract (ADR-0022). Passing evidence proves
// the agent wrote a test that failed and then passed; it does NOT prove
// the test would catch a regression. Strength evidence measures the
// suite's ability to detect regressions via mutation testing and records
// the score as a versioned, auditable artifact.
//
// Honest limits (documented in ADR-0022, repeated here because a
// contract must not overclaim):
//   - The mutation score is a PROXY, not proof. It measures how many
//     generated mutants the suite killed on THIS run with THIS tool.
//   - `incomplete` status means the run exceeded its budget (or the
//     tool was unavailable): the score is UNKNOWN, never silently 0
//     and never silently passed.
//   - `scope: diff` mutates only the files named in the scope: a
//     cross-file escape (a mutant in file A caught only by a test of
//     file B) can be missed when B is outside the diff.
//
// See docs/contracts/CONTRACTS.md §6.3.

import { z } from 'zod';

export const STRENGTH_EVIDENCE_SCHEMA_VERSION = 1 as const;

/**
 * The mutation tool that produced the evidence. Stack adapters map
 * stacks onto tools (core/tdd/strength.ts); the contract only records
 * which tool ran so the score is interpretable later.
 */
export const MutationToolSchema = z.enum([
  'stryker', // node-typescript, react-typescript (StrykerJS)
  'mutmut', // python
  'mutant', // ruby, ruby-rails
  'go-mutesting', // go (gremlins shares the runner, recorded distinctly)
  'gremlins', // go
  'cargo-mutants', // rust
  'stryker-net', // dotnet (Stryker.NET)
]);
export type MutationTool = z.infer<typeof MutationToolSchema>;

/**
 * Status of a strength run. Exhaustive by construction:
 *   - passed:      tool ran to completion and score >= threshold.
 *   - failed:      tool ran to completion and score < threshold.
 *   - incomplete:  the run did NOT complete (budget exceeded, tool
 *                  missing, tool crashed). The score is unknown —
 *                  an incomplete run NEVER counts as passed and never
 *                  fabricates a score.
 */
export const StrengthStatusSchema = z.enum(['passed', 'failed', 'incomplete']);
export type StrengthStatus = z.infer<typeof StrengthStatusSchema>;

/** How the score reacts to the threshold: warn logs, enforce blocks. */
export const StrengthGateModeSchema = z.enum(['warn', 'enforce']);
export type StrengthGateMode = z.infer<typeof StrengthGateModeSchema>;

/** `diff` = only the scoped files; `suite` = the full target set. */
export const StrengthScopeSchema = z.enum(['diff', 'suite']);
export type StrengthScope = z.infer<typeof StrengthScopeSchema>;

/**
 * Configuration surface on the project profile (`.ai-kit/project.yml`):
 *
 *   verification:
 *     strength:
 *       enabled: true      # default false in v1 (opt-in)
 *       threshold: 60      # mutation score percentage
 *       budgetMs: 300000   # hard cap on the mutation run
 *       scope: diff        # 'diff' | 'suite'
 *       gateMode: warn     # 'warn' | 'enforce'
 */
export const StrengthSettingsSchema = z
  .object({
    enabled: z.boolean(),
    threshold: z.number().int().min(0).max(100),
    budgetMs: z.number().int().positive(),
    scope: StrengthScopeSchema,
    gateMode: StrengthGateModeSchema,
  })
  .strict();
export type StrengthSettings = z.infer<typeof StrengthSettingsSchema>;

export const DEFAULT_STRENGTH_SETTINGS: StrengthSettings = {
  enabled: false,
  threshold: 60,
  budgetMs: 300_000,
  scope: 'diff',
  gateMode: 'warn',
};

export const VerificationSettingsSchema = z
  .object({
    strength: StrengthSettingsSchema.optional(),
  })
  .strict();
export type VerificationSettings = z.infer<typeof VerificationSettingsSchema>;

export const StrengthEvidenceSchema = z
  .object({
    schemaVersion: z.literal(STRENGTH_EVIDENCE_SCHEMA_VERSION),
    taskId: z.string().min(1).optional(),
    tool: MutationToolSchema,
    toolVersion: z.string().min(1).optional(),
    status: StrengthStatusSchema,
    /** Mutation score percentage 0–100. Undefined iff status is `incomplete`. */
    score: z.number().min(0).max(100).optional(),
    mutantsGenerated: z.number().int().nonnegative(),
    mutantsKilled: z.number().int().nonnegative(),
    mutantsSurvived: z.number().int().nonnegative(),
    threshold: z.number().int().min(0).max(100),
    scope: StrengthScopeSchema,
    /** Files mutated; empty when the tool did not report a file list. */
    scopeFiles: z.array(z.string()).default([]),
    durationMs: z.number().int().nonnegative(),
    budgetMs: z.number().int().positive(),
    /** Bounded, redacted human-readable derivation (never full output). */
    summary: z.string().max(300),
  })
  .strict()
  .refine((e) => e.status === 'incomplete' || e.score !== undefined, {
    message: 'score is required unless status is incomplete',
    path: ['score'],
  })
  .refine((e) => e.status !== 'incomplete' || e.score === undefined, {
    message: 'an incomplete run must not carry a score',
    path: ['score'],
  })
  .refine((e) => e.mutantsKilled + e.mutantsSurvived <= e.mutantsGenerated, {
    message: 'killed + survived cannot exceed generated mutants',
    path: ['mutantsKilled'],
  });
export type StrengthEvidence = z.infer<typeof StrengthEvidenceSchema>;

/**
 * Deterministic mutation score: round(100 * killed / generated).
 * Returns null when no mutants were generated — a suite with nothing
 * to kill has no measurable strength, and reporting 0 would claim a
 * measurement that was not made.
 */
export function computeMutationScore(killed: number, generated: number): number | null {
  if (generated <= 0) return null;
  return Math.round((100 * killed) / generated);
}

/**
 * Resolve the status of a completed strength run against the threshold.
 * An unknown score (no mutants generated) is `incomplete`: the run
 * measured nothing and must not pass a gate by default.
 */
export function resolveStrengthStatus(score: number | null, threshold: number): StrengthStatus {
  if (score === null) return 'incomplete';
  return score >= threshold ? 'passed' : 'failed';
}

/**
 * Gate decision. `enforce` refuses completion below threshold (the
 * caller turns a `block` decision into a failed verify); `warn` never
 * blocks — it is observability only. An `incomplete` run in `enforce`
 * mode blocks: an unknown score must not certify strength (fail
 * closed).
 */
export function evaluateStrengthGate(
  evidence: Pick<StrengthEvidence, 'status' | 'score'>,
  gateMode: StrengthGateMode,
): { block: boolean; reason: string } {
  if (gateMode === 'warn') {
    return {
      block: false,
      reason:
        evidence.status === 'incomplete'
          ? 'strength run incomplete (warn mode: logged, not blocked)'
          : `mutation score ${evidence.score ?? 'n/a'}% (warn mode: logged, not blocked)`,
    };
  }
  if (evidence.status === 'incomplete') {
    return {
      block: true,
      reason: 'strength run incomplete: score unknown, refusing to certify (enforce mode)',
    };
  }
  if (evidence.status === 'failed') {
    return {
      block: true,
      reason: `mutation score ${evidence.score}% is below the threshold (enforce mode)`,
    };
  }
  return { block: false, reason: `mutation score ${evidence.score}% meets the threshold` };
}
