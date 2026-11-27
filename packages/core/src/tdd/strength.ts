// packages/core/src/tdd/strength.ts
//
// Test-strength measurement for the TDD evidence chain (ADR-0022).
//
// The TDD machine proves a test failed and then passed; it does not
// prove the test would catch a regression. This module runs the
// stack's mutation tool under a HARD BUDGET, parses its reported
// score, and produces a `StrengthEvidence` record for the journal
// and the run state.
//
// Design invariants:
//   - The budget is a hard cap: a mutation run that exceeds budgetMs
//     is killed and recorded as `incomplete` — verify never hangs.
//   - The executor is injectable: offline tests supply a fake; the
//     default runs the tool with shell:false like every kit command.
//   - Parsing is per-tool and testable offline: fixture output →
//     expected score. An unparsable report is `incomplete`, never a
//     fabricated score.
//   - `scope: diff` restricts mutation to the task's likely files
//     (from the plan) so per-task cycles stay fast; `scope: suite`
//     mutates the tool's whole target set.

import {
  Errors,
  STRENGTH_EVIDENCE_SCHEMA_VERSION,
  type MutationTool,
  type Result,
  type StrengthEvidence,
  type StrengthScope,
  type StrengthSettings,
  computeMutationScore,
  resolveStrengthStatus,
} from '@agentic-sdlc-kit/contracts';
import { STACK_ALIASES } from '../stacks/stack-commands.js';

/**
 * Minimal process executor contract. The default implementation runs
 * the command with shell:false and a bounded timeout; tests inject a
 * fake to exercise budget and parsing behavior offline.
 */
export type StrengthExecutor = (
  command: readonly string[],
  opts: { cwd: string; timeoutMs: number },
) => Promise<{
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  durationMs: number;
  spawnError?: string;
}>;

/** Stack → mutation tool + base command (shell:false argv arrays). */
export interface MutationToolSpec {
  readonly tool: MutationTool;
  readonly command: readonly string[];
}

/**
 * Resolve the mutation tool for a detected stack. Returns undefined
 * for stacks without an adapter — the caller reports honestly that
 * strength is unsupported, never silently skips it.
 */
export function mutationToolForStack(
  stack: string,
  opts: { packageManager?: string } = {},
): MutationToolSpec | undefined {
  const canonical = STACK_ALIASES[stack] ?? stack;
  const pm = opts.packageManager ?? 'pnpm';
  switch (canonical) {
    case 'node-typescript':
    case 'react-typescript': {
      // pnpm exec runs the local install; npm/yarn/bun need exec/run forms.
      const exec = pm === 'npm' ? ['npm', 'exec'] : pm === 'yarn' ? ['yarn', 'exec'] : [pm, 'exec'];
      return { tool: 'stryker', command: [...exec, 'stryker', 'run'] };
    }
    case 'python':
      return { tool: 'mutmut', command: ['mutmut', 'run'] };
    case 'ruby':
    case 'ruby-rails':
      return { tool: 'mutant', command: ['bundle', 'exec', 'mutant', 'run'] };
    case 'go':
      return { tool: 'go-mutesting', command: ['go-mutesting', './...'] };
    case 'rust':
      return { tool: 'cargo-mutants', command: ['cargo', 'mutants'] };
    case 'dotnet':
      return { tool: 'stryker-net', command: ['dotnet', 'stryker'] };
    default:
      return undefined;
  }
}

/** Tool-specific output parsers. Each returns score/killed/survived or null. */
export interface MutationScoreParse {
  readonly score: number;
  readonly killed: number;
  readonly generated: number;
}

/**
 * Parse a mutation score from tool output. Testable offline; a tool
 * whose report format changed parses as null (→ `incomplete`), never
 * as a guessed number.
 */
export function parseMutationScore(tool: MutationTool, output: string): MutationScoreParse | null {
  const text = output.replace(/\r/g, '');
  switch (tool) {
    case 'stryker': {
      // StrykerJS: "All mutants", "Killed: N", "Survived: N",
      // and "Mutation score: X%" (older) or
      // "Mutation score based on covered code: X%".
      const killed = /Killed:\s*(\d+)/.exec(text);
      const survived = /Survived:\s*(\d+)/i.exec(text);
      const score = /Mutation score(?:\s+based on (?:covered code|all code))?:\s*([\d.]+)%/.exec(
        text,
      );
      if (killed && survived) {
        const k = Number.parseInt(killed[1]!, 10);
        const s = Number.parseInt(survived[1]!, 10);
        const generated = k + s;
        if (score) {
          const sc = Number.parseFloat(score[1]!);
          if (Number.isFinite(sc)) return { score: Math.round(sc), killed: k, generated };
        }
        const computed = computeMutationScore(k, generated);
        if (computed !== null) return { score: computed, killed: k, generated };
      }
      return null;
    }
    case 'mutmut': {
      // mutmut 2.x: the final table reports "<killed>/<generated>";
      // the ratio line is the source of truth.
      const m = /(\d+)\/(\d+)/.exec(text);
      if (m) {
        const killed = Number.parseInt(m[1]!, 10);
        const generated = Number.parseInt(m[2]!, 10);
        if (generated > 0 && killed <= generated) {
          return { score: Math.round((100 * killed) / generated), killed, generated };
        }
      }
      return null;
    }
    case 'mutant': {
      // mutant: "Killed: N" + "Mutation score : X.XX%"
      const killed = /Killed:\s*(\d+)/i.exec(text);
      const survived = /Alive:\s*(\d+)/i.exec(text);
      const score = /Mutation score\s*:?\s*([\d.]+)%/.exec(text);
      if (killed && survived) {
        const k = Number.parseInt(killed[1]!, 10);
        const s = Number.parseInt(survived[1]!, 10);
        if (score) {
          const sc = Number.parseFloat(score[1]!);
          if (Number.isFinite(sc)) return { score: Math.round(sc), killed: k, generated: k + s };
        }
        const computed = computeMutationScore(k, k + s);
        if (computed !== null) return { score: computed, killed: k, generated: k + s };
      }
      return null;
    }
    case 'go-mutesting':
    case 'gremlins': {
      // go-mutesting: "The mutation score is 0.750000 (30/40)"
      const m = /mutation score is\s*([\d.]+)\s*\((\d+)\/(\d+)\)/i.exec(text);
      if (m) {
        const ratio = Number.parseFloat(m[1]!);
        const killed = Number.parseInt(m[2]!, 10);
        const generated = Number.parseInt(m[3]!, 10);
        if (generated > 0) {
          return { score: Math.round(ratio * 100), killed, generated };
        }
      }
      return null;
    }
    case 'cargo-mutants': {
      // cargo-mutants: "N mutants tested: M killed" + "mutation score: X%"
      const tested = /(\d+)\s+mutants?\s+tested:\s*(\d+)\s+killed/i.exec(text);
      const score = /mutation score:\s*([\d.]+)%/i.exec(text);
      if (tested) {
        const generated = Number.parseInt(tested[1]!, 10);
        const killed = Number.parseInt(tested[2]!, 10);
        if (score) {
          const sc = Number.parseFloat(score[1]!);
          if (Number.isFinite(sc)) return { score: Math.round(sc), killed, generated };
        }
        const computed = computeMutationScore(killed, generated);
        if (computed !== null) return { score: computed, killed, generated };
      }
      return null;
    }
    case 'stryker-net': {
      // Stryker.NET: "Killed: N" ... "Mutation score: X%"
      const killed = /Killed:\s*(\d+)/i.exec(text);
      const survived = /Survived:\s*(\d+)/i.exec(text);
      const score = /mutation score:\s*([\d.]+)%/i.exec(text);
      if (killed && survived) {
        const k = Number.parseInt(killed[1]!, 10);
        const s = Number.parseInt(survived[1]!, 10);
        if (score) {
          const sc = Number.parseFloat(score[1]!);
          if (Number.isFinite(sc)) return { score: Math.round(sc), killed: k, generated: k + s };
        }
        const computed = computeMutationScore(k, k + s);
        if (computed !== null) return { score: computed, killed: k, generated: k + s };
      }
      return null;
    }
  }
}

export interface StrengthRunRequest {
  readonly cwd: string;
  readonly stack: string;
  readonly settings: StrengthSettings;
  /** Task-scoped files for `scope: diff` (from the plan's likelyFiles). */
  readonly scopeFiles?: readonly string[];
  readonly packageManager?: string;
  readonly taskId?: string;
  /** Defaults to a shell:false executor; tests inject a fake. */
  readonly executor?: StrengthExecutor;
}

/**
 * Build the actual argv for a strength run, including diff-scope file
 * restriction. Exported for tests and for the doctor check that
 * explains what a strength run would execute.
 */
export function buildStrengthCommand(
  spec: MutationToolSpec,
  scope: StrengthScope,
  scopeFiles: readonly string[],
): readonly string[] {
  if (scope !== 'diff' || scopeFiles.length === 0) return [...spec.command];
  switch (spec.tool) {
    case 'stryker':
      return [...spec.command, '--mutate', scopeFiles.join(',')];
    case 'mutmut':
      return [...spec.command, '--paths-to-mutate', scopeFiles.join(',')];
    case 'mutant':
      return [...spec.command, '--use', scopeFiles.join(',')];
    case 'go-mutesting':
    case 'gremlins':
      // go-mutesting takes package paths, not file lists; the diff
      // scope maps onto the packages owning the changed files.
      return [
        ...spec.command,
        ...new Set(scopeFiles.map((f) => f.split('/')[0] ?? '').filter((p) => p !== '')),
      ];
    case 'cargo-mutants':
      return [...spec.command, '--file', scopeFiles.join(',')];
    case 'stryker-net':
      return [...spec.command, ...scopeFiles.flatMap((f) => ['--mutate', f])];
  }
}

/**
 * Run one strength measurement under the budget. NEVER throws: every
 * failure mode (unknown stack, missing tool, timeout, unparsable
// report) returns a Result; an incomplete run carries no score.
 */
export async function runStrengthCheck(req: StrengthRunRequest): Promise<Result<StrengthEvidence>> {
  const spec = mutationToolForStack(req.stack, { packageManager: req.packageManager });
  if (!spec) {
    return {
      ok: false,
      error: Errors.verificationFailed(
        `Test-strength is not supported for stack '${req.stack}': ` +
          `no mutation tool adapter is configured (ADR-0022 §adapters).`,
      ),
    };
  }

  const scopeFiles = req.scopeFiles ?? [];
  const command = buildStrengthCommand(spec, req.settings.scope, scopeFiles);

  const outcome = await (req.executor ?? defaultStrengthExecutor)(command, {
    cwd: req.cwd,
    timeoutMs: req.settings.budgetMs,
  });

  const evidence = evidenceFromOutcome({
    tool: spec.tool,
    outcome,
    settings: req.settings,
    scopeFiles,
    taskId: req.taskId,
  });
  return { ok: true, value: evidence };
}

function evidenceFromOutcome(args: {
  tool: MutationTool;
  outcome: Awaited<ReturnType<StrengthExecutor>>;
  settings: StrengthSettings;
  scopeFiles: readonly string[];
  taskId?: string;
}): StrengthEvidence {
  const { tool, outcome, settings, scopeFiles } = args;
  const base = {
    schemaVersion: STRENGTH_EVIDENCE_SCHEMA_VERSION,
    tool,
    threshold: settings.threshold,
    scope: settings.scope,
    scopeFiles: [...scopeFiles],
    durationMs: outcome.durationMs,
    budgetMs: settings.budgetMs,
    ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
  };

  if (outcome.timedOut) {
    return {
      ...base,
      status: 'incomplete' as const,
      mutantsGenerated: 0,
      mutantsKilled: 0,
      mutantsSurvived: 0,
      summary: `mutation run exceeded budgetMs=${settings.budgetMs} — recorded incomplete, never a guessed score`,
    };
  }

  const parsed = parseMutationScore(tool, outcome.output);
  if (outcome.spawnError !== undefined || parsed === null) {
    return {
      ...base,
      status: 'incomplete' as const,
      mutantsGenerated: 0,
      mutantsKilled: 0,
      mutantsSurvived: 0,
      summary:
        outcome.spawnError !== undefined
          ? `mutation tool unavailable: ${outcome.spawnError.slice(0, 120)}`
          : 'mutation report could not be parsed — recorded incomplete (no fabricated score)',
    };
  }

  const score = parsed.score;
  const status = resolveStrengthStatus(score, settings.threshold);
  const survived = parsed.generated - parsed.killed;
  return {
    ...base,
    status,
    score,
    mutantsGenerated: parsed.generated,
    mutantsKilled: parsed.killed,
    mutantsSurvived: survived,
    summary: `${parsed.killed}/${parsed.generated} mutants killed (${score}% vs threshold ${settings.threshold}%) — ${status}`,
  };
}

/**
 * Default executor: shell:false, one process, bounded output. Mirrors
 * the verification runner's guarantees for the mutation subprocess.
 */
const defaultStrengthExecutor: StrengthExecutor = async (command, opts) => {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const [file, ...args] = [...command];
    if (!file) {
      resolve({
        exitCode: 1,
        output: 'empty command array',
        timedOut: false,
        durationMs: 0,
        spawnError: 'empty command array',
      });
      return;
    }
    const started = Date.now();
    const child = spawn(file, args, { cwd: opts.cwd, shell: false });
    let output = '';
    const MAX = 2 * 1024 * 1024; // 2 MB: mutation reports are large but bounded
    const append = (chunk: Buffer | string): void => {
      if (output.length < MAX) output += chunk.toString();
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        output,
        timedOut: false,
        durationMs: Date.now() - started,
        spawnError: err.message,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        output,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
};
