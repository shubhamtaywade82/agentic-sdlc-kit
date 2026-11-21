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
// (createFeatureCommand({ agentProviders })); the default command ships
// with NONE registered, so `run` fails with AGENT_PROVIDER_NOT_CONFIGURED
// (exit 3) until a provider is configured (PR4 adds claude-code).

import path from 'node:path';
import {
  finalizeFeatureRun,
  getFeatureRunState,
  runTddPhase,
  startFeatureRun,
  type FeatureRunReport,
} from '@agentic-sdlc-kit/core';
import type { AgentProvider } from '@agentic-sdlc-kit/contracts';
import {
  AgentGateway,
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

export interface FeatureCommandOptions {
  /**
   * Agent providers injectable for Mode 1 (`run`) — used by embedding
   * code and tests. The shipped CLI registers none: with no provider,
   * `run` fails with AGENT_PROVIDER_NOT_CONFIGURED (ADR-0019 §1).
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

      if (isPhase(action)) {
        return runPhase(ctx, root, featureId, action, positional[2], isJson);
      }
      switch (action) {
        case 'start':
          return runStart(ctx, root, featureId, isJson);
        case 'status':
          return runStatus(ctx, root, featureId, isJson);
        case 'verify':
          return runVerify(ctx, root, featureId, isJson, ctx.argv.includes('--dry-run'));
        case 'run':
          return runOrchestrated(ctx, root, featureId, isJson, opts);
        case 'auto': {
          const state = await getFeatureRunState(root, featureId);
          return state.ok
            ? runStatus(ctx, root, featureId, isJson)
            : runStart(ctx, root, featureId, isJson);
        }
        default:
          return fail(
            ctx,
            `unknown action '${action}' (expected start|red|green|refactor|status|verify|run)`,
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
): Promise<CommandResult> {
  const res = await startFeatureRun({ featureId, projectRoot: root });
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
): Promise<CommandResult> {
  if (!taskId) return fail(ctx, `phase '${phase}' requires a task id (see \`kit feature ${featureId} status\`)`);
  const res = await runTddPhase({ featureId, projectRoot: root, taskId, phase });
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

async function runVerify(
  ctx: CommandContext,
  root: string,
  featureId: string,
  isJson: boolean,
  dryRun: boolean,
): Promise<CommandResult> {
  const res = await finalizeFeatureRun({ featureId, projectRoot: root, dryRun });
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
 * agent provider. Providers come from the command's construction options
 * — the shipped CLI registers none, and `run` then fails blocked (exit 3)
 * rather than pretending a manual workflow completed.
 */
async function runOrchestrated(
  ctx: CommandContext,
  root: string,
  featureId: string,
  isJson: boolean,
  opts: FeatureCommandOptions,
): Promise<CommandResult> {
  const providerFlag = parseFlagValue(ctx.argv, '--provider');
  const maxDurationMs = parseFlagValue(ctx.argv, '--max-duration-ms');

  if (!providerFlag) {
    return blocked(
      ctx,
      'AGENT_PROVIDER_NOT_CONFIGURED: no agent provider selected. Pass --provider <id> ' +
        'with a configured provider (none are configured in this build; PR4 adds ' +
        'claude-code). Mode 1 execution will not fall back to pretending a manual ' +
        'workflow completed — use red/green/refactor to drive the phases yourself.',
    );
  }

  const gateway = new AgentGateway({
    providers: opts.agentProviders ?? [],
    projectRoot: root,
  });

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
      if (res.error.code === 'AGENT_PROVIDER_NOT_CONFIGURED') return blocked(ctx, res.error.message);
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
    '  verify               audit the evidence chain and run final verification',
    '  run                  Mode 1: orchestrate all phases through an agent provider',
    '                       in an isolated git worktree (ADR-0019)',
    '  (none)               start if no run exists, otherwise show status',
    '',
    'Options:',
    '  --dry-run            (verify only) simulate the final verification',
    '  --provider <id>      (run only) agent provider to orchestrate through',
    '  --max-duration-ms N  (run only) per-execution duration budget',
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
