// packages/cli/src/commands/feature.ts
//
// `kit feature <feature-id> [action] [task-id] [--dry-run] [--json]`.
//
// Phase driver for the TDD feature workflow (ADR-0018). The agent writes
// tests and implementations between invocations; the kit verifies,
// records evidence, and blocks completion without a complete
// Red -> Green -> Refactor chain per task.
//
// `kit feature <id> run` is Mode 1 (kit-orchestrated, ADR-0019): the kit
// drives the SAME TDD state machine through a configured agent provider
// in an isolated git worktree. Providers are injected at construction
// (createFeatureCommand({ agentProviders })); since PR4 the shipped CLI
// registers claude-code by DEFAULT — and gates on its healthCheck: when
// the claude CLI is missing or misconfigured, `run` fails blocked
// (exit 3) with an honest message, never a silent manual-workflow
// fallback (ADR-0019 §1, ADR-0020 §4).

import path from 'node:path';
import {
  finalizeFeatureRun,
  getFeatureRunState,
  runStrengthPhase,
  runTddPhase,
  startFeatureRun,
  type FeatureRunReport,
} from '@agentic-sdlc-kit/core';
import type { AgentProvider, JournalActor } from '@agentic-sdlc-kit/contracts';
import {
  AgentGateway,
  ClaudeCodeProvider,
  runFeatureOrchestration,
  type OrchestrationReport,
} from '../application/agent/index.js';
import type { Command, CommandContext, CommandResult } from './types.js';

const PHASES = ['red', 'green', 'refactor'] as const;
type Phase = (typeof PHASES)[number];

function isPhase(action: string): action is Phase {
  return (PHASES as readonly string[]).includes(action);
}

function fail(ctx: CommandContext, message: string): CommandResult {
  ctx.stderr(`kit feature: ${message}\n`);
  return { exitCode: 1, message };
}

function blocked(ctx: CommandContext, message: string): CommandResult {
  ctx.stderr(`kit feature: ${message}\n`);
  return { exitCode: 3, message };
}

/**
 * Resolve the journal actor (ADR-0021 §3). The kit cannot infer agent
 * vs. human at the CLI boundary — a host DECLARES itself via `--host
 * <id>` or the KIT_HOST environment variable, and the journal records
 * the declaration. Undeclared invocations are recorded honestly as
 * humans, not guessed to be agents.
 */
function resolveActor(argv: ReadonlyArray<string>): JournalActor {
  const fromFlag = parseFlagValue(argv, '--host');
  const host =
    fromFlag ??
    (process.env['KIT_HOST'] && process.env['KIT_HOST'].length > 0
      ? process.env['KIT_HOST']
      : undefined);
  return host !== undefined ? { kind: 'agent', host } : { kind: 'human' };
}

export interface FeatureCommandOptions {
  /**
   * Agent providers injectable for Mode 1 (`run`) — used by embedding
   * code and tests. When omitted, the shipped CLI registers the secure
   * claude-code provider (PR4) against the resolved project root.
   */
  readonly agentProviders?: ReadonlyArray<AgentProvider>;
}

export function createFeatureCommand(opts: FeatureCommandOptions = {}): Command {
  return {
    name: 'feature',
    summary:
      'Drive the TDD feature workflow (spec -> plan -> red/green/refactor -> verify) or orchestrate it through an agent provider (run).',
    async run(ctx: CommandContext): Promise<CommandResult> {
      if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
        ctx.stdout(formatHelp());
        return { exitCode: 0 };
      }

      const positional = ctx.argv.filter((a) => !a.startsWith('-'));
      const featureId = positional[0];
      if (!featureId) {
        return fail(ctx, 'missing required feature identifier (e.g. FEATURE-001)');
      }

      const isJson = ctx.argv.includes('--json');
      const action = positional[1] ?? 'auto';
      const root = path.resolve(ctx.cwd, '.');
      const actor = resolveActor(ctx.argv);

      if (isPhase(action)) {
        return runPhase(ctx, root, featureId, action, positional[2], isJson, actor);
      }
      switch (action) {
        case 'start':
          return runStart(ctx, root, featureId, isJson, actor);
        case 'status':
          return runStatus(ctx, root, featureId, isJson);
        case 'strength':
          return runStrength(ctx, root, featureId, positional[2], isJson, actor);
        case 'verify':
          return runVerify(ctx, root, featureId, isJson, ctx.argv.includes('--dry-run'), actor);
        case 'run':
          return runOrchestrated(ctx, root, featureId, isJson, opts);
        case 'auto': {
          const state = await getFeatureRunState(root, featureId);
          return state.ok
            ? runStatus(ctx, root, featureId, isJson)
            : runStart(ctx, root, featureId, isJson, actor);
        }
        default:
          return fail(
            ctx,
            `unknown action '${action}' (expected start|red|green|refactor|status|strength|verify|run)`,
          );
      }
    },
  };
}

export const featureCommand: Command = createFeatureCommand();

async function runStart(
  ctx: CommandContext,
  root: string,
  featureId: string,
  isJson: boolean,
  actor: JournalActor,
): Promise<CommandResult> {
  const res = await startFeatureRun({ featureId, projectRoot: root, actor });
  if (!res.ok) return fail(ctx, res.error.message);
  if (isJson) {
    ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    return { exitCode: 0 };
  }
  const taskIds = Object.keys(res.value.tasks);
  const first = taskIds[0] ?? 'none';
  ctx.stdout(
    [
      `TDD run started for ${featureId} (${taskIds.length} task(s)).`,
      `Next: write the failing test for ${first}, then run:`,
      `  kit feature ${featureId} red ${first}`,
      '',
    ].join('\n'),
  );
  return { exitCode: 0 };
}

async function runPhase(
  ctx: CommandContext,
  root: string,
  featureId: string,
  phase: Phase,
  taskId: string | undefined,
  isJson: boolean,
  actor: JournalActor,
): Promise<CommandResult> {
  if (!taskId)
    return fail(
      ctx,
      `phase '${phase}' requires a task id (see \`kit feature ${featureId} status\`)`,
    );
  const res = await runTddPhase({ featureId, projectRoot: root, taskId, phase, actor });
  if (!res.ok) return fail(ctx, res.error.message);
  if (isJson) {
    ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    return { exitCode: 0 };
  }
  ctx.stdout(formatPhaseMessage(featureId, taskId, phase));
  return { exitCode: 0 };
}

function formatPhaseMessage(featureId: string, taskId: string, phase: Phase): string {
  if (phase === 'red') {
    return [
      `${taskId} red recorded: verification failed as expected.`,
      `Next: implement ${taskId} minimally, then run:`,
      `  kit feature ${featureId} green ${taskId}`,
      '',
    ].join('\n');
  }
  if (phase === 'green') {
    return [
      `${taskId} green recorded: verification passed.`,
      `Next: refactor ${taskId} if needed, then run:`,
      `  kit feature ${featureId} refactor ${taskId}`,
      '',
    ].join('\n');
  }
  return [
    `${taskId} completed (red -> green -> refactor recorded).`,
    'Continue with the next task, or run `verify` when all tasks are done:',
    `  kit feature ${featureId} verify`,
    '',
  ].join('\n');
}

async function runStatus(
  ctx: CommandContext,
  root: string,
  featureId: string,
  isJson: boolean,
): Promise<CommandResult> {
  const res = await getFeatureRunState(root, featureId);
  if (!res.ok) return fail(ctx, res.error.message);
  if (isJson) {
    ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    return { exitCode: 0 };
  }
  const lines = [`Feature run ${featureId}:`];
  for (const task of Object.values(res.value.tasks)) {
    lines.push(`  ${task.taskId}: ${task.phase} (${task.records.length} record(s))`);
  }
  const pending = Object.values(res.value.tasks).find((t) => t.phase !== 'completed');
  if (pending) {
    lines.push(`Next action: kit feature ${featureId} ${pending.phase} ${pending.taskId}`);
  } else {
    lines.push(`All tasks complete. Next action: kit feature ${featureId} verify`);
  }
  ctx.stdout(lines.join('\n') + '\n');
  return { exitCode: 0 };
}

/**
 * `kit feature <id> strength <task-id>` (ADR-0022): run the optional
 * mutation-score measurement for a completed task and record it as
 * journal + persisted evidence. The gate decision is reported; blocking
 * happens at verify when gateMode is enforce.
 */
async function runStrength(
  ctx: CommandContext,
  root: string,
  featureId: string,
  taskId: string | undefined,
  isJson: boolean,
  actor: JournalActor,
): Promise<CommandResult> {
  if (!taskId) {
    return fail(ctx, `strength requires a task id (see \`kit feature ${featureId} status\`)`);
  }
  const res = await runStrengthPhase({
    featureId,
    projectRoot: root,
    taskId,
    actor,
  });
  if (!res.ok) return fail(ctx, res.error.message);
  if (isJson) {
    ctx.stdout(
      JSON.stringify(
        { taskId, strength: res.value.evidence, gateBlocked: res.value.blocked },
        null,
        2,
      ) + '\n',
    );
    return { exitCode: 0 };
  }
  const e = res.value.evidence;
  const score = e.score !== undefined ? `${e.score}%` : 'n/a';
  ctx.stdout(
    [
      `${taskId} strength ${e.status} (score ${score} vs threshold ${e.threshold}%).`,
      `  tool=${e.tool} scope=${e.scope} mutants=${e.mutantsKilled}/${e.mutantsGenerated} killed`,
      `  ${e.summary}`,
      res.value.blocked
        ? `Strength gate: BLOCKED (enforce) — \`kit feature ${featureId} verify\` will refuse until the suite clears ${e.threshold}%.`
        : `Strength gate: not blocking (warn mode).`,
      '',
    ].join('\n'),
  );
  return { exitCode: 0 };
}

async function runVerify(
  ctx: CommandContext,
  root: string,
  featureId: string,
  isJson: boolean,
  dryRun: boolean,
  actor: JournalActor,
): Promise<CommandResult> {
  const res = await finalizeFeatureRun({ featureId, projectRoot: root, dryRun, actor });
  if (!res.ok) return fail(ctx, res.error.message);
  if (isJson) {
    ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
  } else {
    ctx.stdout(formatSummary(res.value));
  }
  return { exitCode: res.value.status === 'passed' ? 0 : 1 };
}

/**
 * Mode 1 (ADR-0019): orchestrate the whole feature through a configured
 * agent provider. Providers come from the command's construction options;
 * since PR4 the shipped CLI registers claude-code by default and gates on
 * its healthCheck — an unavailable runtime is a blocked run (exit 3) with
 * an honest message, never a silent manual-workflow fallback.
 */
async function runOrchestrated(
  ctx: CommandContext,
  root: string,
  featureId: string,
  isJson: boolean,
  opts: FeatureCommandOptions,
): Promise<CommandResult> {
  const providerFlag = parseFlagValue(ctx.argv, '--provider') ?? 'claude-code';
  const maxDurationMs = parseFlagValue(ctx.argv, '--max-duration-ms');

  // PR4: the shipped CLI registers claude-code against the resolved root
  // (the provider roots its encrypted resume store there). Explicitly
  // injected providers override the default entirely.
  const providers: ReadonlyArray<AgentProvider> = opts.agentProviders ?? [
    new ClaudeCodeProvider({ projectRoot: root }),
  ];

  const gateway = new AgentGateway({
    providers,
    projectRoot: root,
  });

  // Health gate: a REGISTERED provider whose runtime is unavailable is a
  // blocked run (exit 3) with an honest message — never a spawn that
  // would flake into a silent manual-workflow fallback (ADR-0020 §4).
  if (gateway.hasProvider(providerFlag)) {
    const provider = providers.find((p) => p.id === providerFlag);
    const health = await provider?.healthCheck();
    if (provider && health && !health.available) {
      return blocked(
        ctx,
        `AGENT_PROVIDER_UNAVAILABLE: provider '${providerFlag}' is registered but its ` +
          `runtime is unavailable: ${health.message ?? 'no detail'}. Mode 1 execution will ` +
          `not fall back to pretending a manual workflow completed — install the ` +
          `provider runtime or drive the phases yourself with red/green/refactor.`,
      );
    }
  }

  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  process.once('SIGINT', onSigint);
  try {
    const res = await runFeatureOrchestration({
      projectRoot: root,
      featureId,
      gateway,
      providerId: providerFlag,
      ...(maxDurationMs !== undefined && Number.isFinite(Number(maxDurationMs))
        ? { maxDurationMs: Math.max(1, Math.floor(Number(maxDurationMs))) }
        : {}),
      signal: controller.signal,
      ...(isJson ? {} : { onProgress: (line: string) => ctx.stdout(line) }),
    });
    if (!res.ok) {
      if (res.error.code === 'AGENT_PROVIDER_NOT_CONFIGURED')
        return blocked(ctx, res.error.message);
      return fail(ctx, res.error.message);
    }
    const report = res.value;
    if (isJson) {
      ctx.stdout(JSON.stringify(report, null, 2) + '\n');
    } else {
      ctx.stdout(formatOrchestrationReport(report));
    }
    if (report.status === 'completed') return { exitCode: 0 };
    if (report.status === 'needs_approval') return blocked(ctx, report.message);
    return { exitCode: 1, message: report.message };
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

function parseFlagValue(argv: ReadonlyArray<string>, flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith('-')) return undefined;
  return value;
}

function formatOrchestrationReport(report: OrchestrationReport): string {
  const lines: string[] = [
    `Feature Orchestration: ${report.featureId} (run ${report.runId}, provider ${report.providerId})`,
    `Status:               ${report.status.toUpperCase()}`,
    `Workspace:            ${report.worktreePath} (branch ${report.workspace.branch ?? 'n/a'})`,
  ];
  for (const t of report.tasks) {
    lines.push(
      `  ${t.taskId}: ${t.completed ? 'completed' : `stopped at ${t.phase}`} (${t.records} evidence record(s))`,
    );
  }
  lines.push(`Executions: ${report.executions.length} agent execution(s)`);
  for (const e of report.executions) {
    lines.push(`  ${e.executionId}: ${e.outcome}`);
  }
  if (report.verification) {
    lines.push(
      `Final verification:   ${report.verification.status.toUpperCase()} (${report.verification.checks.length} checks)`,
    );
  }
  lines.push(report.message);
  return lines.join('\n') + '\n';
}

function formatSummary(report: FeatureRunReport): string {
  const evidence = report.tddEvidence
    .map((t) => `${t.taskId} [${t.records.map((r) => `${r.phase}:${r.status}`).join(' ')}]`)
    .join('; ');
  const lines: string[] = [
    `Feature Workflow:  ${report.featureId} (${report.spec.title})`,
    `Status:            ${report.status.toUpperCase()}`,
    `Tasks Executed:    ${report.tasksExecuted.length} tasks (${report.tasksExecuted.join(', ')})`,
    `TDD Evidence:      ${evidence}`,
    `Verification:      ${report.verification.status.toUpperCase()} (${report.verification.checks.length} checks)`,
    `Total Duration:    ${report.durationMs}ms`,
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit feature <feature-id> [action] [task-id] [--dry-run] [--json]',
    '       kit feature <feature-id> run [--provider <id>] [--max-duration-ms <n>] [--json]',
    '',
    'Drive the TDD feature workflow phase by phase, or orchestrate it end-to-end',
    'through an agent provider. The kit verifies, records evidence, and blocks',
    'completion until every task has a complete Red -> Green -> Refactor evidence chain.',
    '',
    'Actions:',
    '  start                validate spec/plan and initialize the run state',
    '  red <task-id>        run verification: it MUST fail (test targets new behavior)',
    '  green <task-id>      run verification: it MUST pass (after implementing)',
    '  refactor <task-id>   run verification: it MUST pass (behavior preserved)',
    '  status               show run state and the next action',
    '  strength <task-id>   run the optional mutation-score stage for a completed task',
    '                       (ADR-0022; requires verification.strength.enabled)',
    '  verify               audit the evidence chain and run final verification',
    '  run                  Mode 1: orchestrate all phases through an agent provider',
    '                       in an isolated git worktree (ADR-0019)',
    '  (none)               start if no run exists, otherwise show status',
    '',
    'Options:',
    '  --dry-run            (verify only) simulate the final verification',
    '  --provider <id>      (run only) agent provider to orchestrate through (default: claude-code)',
    '  --max-duration-ms N  (run only) per-execution duration budget',
    '  --host <id>          declare the invoking host for the execution journal',
    '                       (ADR-0021; also read from KIT_HOST)',
    '  --json               output machine-readable run state or report',
    '  --help               Show this message',
    '',
    'Exit codes:',
    '  0  action succeeded / feature completed',
    '  1  verification or orchestration failed',
    '  3  blocked: no agent provider configured (AGENT_PROVIDER_NOT_CONFIGURED)',
    '     or the run is waiting for a required approval',
    '',
  ].join('\n');
}
