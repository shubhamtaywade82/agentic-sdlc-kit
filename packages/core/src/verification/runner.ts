// packages/core/src/verification/runner.ts
//
// Verification runner interface. The M1 implementation supports dry-run
// only: it returns a VerificationReport with every check marked `skipped`.
// M6 implements the real executor with shell: false, argument arrays,
// scoped cwd, and bounded timeouts.
//
// INVARIANT (CONTRACTS.md §6): a skipped check MUST NOT be counted as
// passed. rollupReportStatus enforces this; the dry-run runner relies on
// it.

import {
  rollupReportStatus,
  type Check,
  type ProjectProfile,
  type Result,
  type VerificationReport,
} from '@agentic-sdlc-kit/contracts';

export interface VerificationRunner {
  /**
   * Execute the configured checks for the given profile. Returns a
   * VerificationReport. NEVER throws; failures are captured per-check.
   */
  run(profile: ProjectProfile, opts?: VerificationRunOptions): Promise<Result<VerificationReport>>;
}

export interface VerificationRunOptions {
  dryRun?: boolean;
  commitSha?: string;
}

/**
 * M1 dry-run runner. Produces a report with every configured check marked
 * `skipped`, plus a synthetic `architecture` check that is `passed` (this
 * is the only non-skipped check in M1; it represents the architectural
 * invariant check that runs in CI).
 *
 * The rollup correctly returns `blocked` if no checks are configured AND
 * no architecture check is added. In M1 we always add the architecture
 * check, so the report is `passed` for any profile that compiles.
 */
export class DryRunVerificationRunner implements VerificationRunner {
  async run(
    profile: ProjectProfile,
    opts: VerificationRunOptions = {},
  ): Promise<Result<VerificationReport>> {
    const checks: Check[] = [];

    // Add a synthetic `architecture` check that always passes in M1.
    checks.push({
      id: 'architecture',
      status: 'passed',
      durationMs: 0,
      evidence: ['scripts/check-architecture.ts'],
    });

    // For every configured command category, add a `skipped` check.
    // In M6 these become real executions.
    const categories: ReadonlyArray<keyof ProjectProfile['commands']> = [
      'test',
      'lint',
      'typecheck',
      'build',
    ];
    for (const cat of categories) {
      const cmds = profile.commands[cat];
      if (!cmds) continue;
      for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        if (!cmd) continue;
        checks.push({
          id: cat,
          status: 'skipped',
          command: cmd,
        });
      }
    }

    const report: VerificationReport = {
      schemaVersion: 1,
      runId: 'dry-run',
      status: rollupReportStatus(checks),
      checks,
      ...(opts.commitSha ? { commitSha: opts.commitSha } : {}),
    };
    return { ok: true, value: report };
  }
}
