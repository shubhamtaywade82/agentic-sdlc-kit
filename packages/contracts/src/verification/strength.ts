// packages/contracts/src/verification/strength.ts
//
// Test-strength evidence contract (ADR-0022).
//
// Evidence of passing is not evidence of strength: a green suite can still
// be weak. Strength evidence records the measured mutation score of a test
// suite alongside the configured threshold and gate policy.
//
// Critical invariants (see docs/contracts/CONTRACTS.md §6.1):
//   - `status` is the HONEST measurement outcome: `passed` means the score
//     was measured and met the threshold; `failed` means it was measured and
//     fell below; `blocked` means it could not be measured (timeout, missing
//     or unparseable report) — NEVER counted as passed.
//   - `score` is `null` exactly when the score was not measured.
//   - `gateMode` governs the exit POLICY of the caller, never the honesty of
//     the evidence: in `warn` mode a below-threshold score is still recorded
//     as `failed`; only the exit code becomes advisory.
//   - The mutation command is an argument array. The executor MUST run it
//     with shell: false (same rule as every other command).

import { z } from 'zod';
import { CommandSchema } from '../project/project-profile.js';

export const STRENGTH_EVIDENCE_SCHEMA_VERSION = 1 as const;

/**
 * Report parsers shipped in v1 (ADR-0022):
 *   - `stryker`: StrykerJS and Stryker.NET JSON reports.
 *   - `normalized`: the kit's extension point — any command that emits the
 *     normalized JSON shape { score, generated, killed, survived }.
 * More tools (mutmut, mutant, go-mutesting, cargo-mutants) join this enum
// through the same registry, each with its own parser and tests.
 */
export const StrengthToolSchema = z.enum(['stryker', 'normalized']);
export type StrengthTool = z.infer<typeof StrengthToolSchema>;

/** `warn`: measurement is advisory (exit code ignores a below-threshold score). `enforce`: it gates. */
export const StrengthGateModeSchema = z.enum(['warn', 'enforce']);
export type StrengthGateMode = z.infer<typeof StrengthGateModeSchema>;

/** `diff`: mutate only code changed in this run (incremental). `suite`: full run. */
export const StrengthScopeSchema = z.enum(['diff', 'suite']);
export type StrengthScope = z.infer<typeof StrengthScopeSchema>;

export const StrengthConfigSchema = z
  .object({
    schemaVersion: z.literal(STRENGTH_EVIDENCE_SCHEMA_VERSION),
    tool: StrengthToolSchema,
    command: CommandSchema,
    /** Path to the tool's JSON report, relative to the repository root. */
    reportPath: z.string().min(1),
    /** Minimum mutation score percentage (0-100) for a passed verdict. */
    threshold: z.number().min(0).max(100),
    gateMode: StrengthGateModeSchema,
    /** Hard cap on the mutation run. A run that exceeds it is `blocked`, never silently truncated. */
    budgetMs: z.number().int().positive(),
    scope: StrengthScopeSchema,
  })
  .strict();

export type StrengthConfig = z.infer<typeof StrengthConfigSchema>;

export const StrengthEvidenceSchema = z
  .object({
    schemaVersion: z.literal(STRENGTH_EVIDENCE_SCHEMA_VERSION),
    tool: StrengthToolSchema,
    scope: StrengthScopeSchema,
    status: z.enum(['passed', 'failed', 'blocked', 'skipped']),
    /** Mutation score percentage (0-100). `null` exactly when not measured. */
    score: z.number().min(0).max(100).nullable(),
    mutantsGenerated: z.number().int().nonnegative(),
    mutantsKilled: z.number().int().nonnegative(),
    mutantsSurvived: z.number().int().nonnegative(),
    threshold: z.number().min(0).max(100),
    gateMode: StrengthGateModeSchema,
    /** True when the mutation run exceeded budgetMs and was terminated. */
    timedOut: z.boolean(),
    durationMs: z.number().int().nonnegative(),
    command: z.array(z.string().min(1)),
    reportPath: z.string().min(1),
    notes: z.array(z.string()).optional(),
  })
  .strict();

export type StrengthEvidence = z.infer<typeof StrengthEvidenceSchema>;

/**
 * Gated outcome of strength evidence. Pure function shared by `kit strength`
 * and `kit verify --strength` so the gate semantics exist exactly once.
 *
 * Fail closed: inconsistent evidence (a `passed` status without a measured
 * score, for example) yields `blocked`, never `passed`.
 */
export function strengthVerdict(evidence: StrengthEvidence): 'passed' | 'failed' | 'blocked' {
  if (evidence.status === 'passed' && evidence.score !== null && evidence.score >= evidence.threshold) {
    return 'passed';
  }
  if (evidence.status === 'failed' && evidence.score !== null && evidence.score < evidence.threshold) {
    return 'failed';
  }
  return 'blocked';
}

/**
 * Exit-code policy for strength evidence.
 *
 * - `passed` → 0.
 * - `failed` → 1 in `enforce` mode; 0 in `warn` mode (advisory: the evidence
 *   still records the honest `failed` status).
 * - `blocked` → 1 in BOTH modes: a measurement the user asked for and did
 *   not get is an error, never a silent pass (CONTRACTS.md §1.1 semantics).
 */
export function strengthExitCode(
  verdict: 'passed' | 'failed' | 'blocked',
  gateMode: StrengthGateMode,
): 0 | 1 {
  if (verdict === 'passed') return 0;
  if (verdict === 'failed' && gateMode === 'warn') return 0;
  return 1;
}
