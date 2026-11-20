// packages/cli/src/commands/feature.ts
//
// `kit feature <feature-id> [action] [task-id] [--dry-run] [--json]`.
//
// Phase driver for the TDD feature workflow (ADR-0018). The agent writes
// tests and implementations between invocations; the kit verifies,
// records evidence, and blocks completion without a complete
// Red -> Green -> Refactor chain per task.

import path from 'node:path';
import {
  finalizeFeatureRun,
  getFeatureRunState,
  runTddPhase,
  startFeatureRun,
  type FeatureRunReport,
} from '@agentic-sdlc-kit/core';
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

export const featureCommand: Command = {
  name: 'feature',
  summary:
    'Drive the phase-based TDD feature workflow (spec -> plan -> red/green/refactor -> verify).',
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
      case 'auto': {
        const state = await getFeatureRunState(root, featureId);
        return state.ok
          ? runStatus(ctx, root, featureId, isJson)
          : runStart(ctx, root, featureId, isJson);
      }
      default:
        return fail(ctx, `unknown action '${action}' (expected start|red|green|refactor|status|verify)`);
    }
  },
};

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
    '',
    'Drive the TDD feature workflow phase by phase. The agent writes tests and',
    'implementations between invocations; the kit verifies, records evidence,',
    'and blocks completion until every task has a complete',
    'Red -> Green -> Refactor evidence chain.',
    '',
    'Actions:',
    '  start                validate spec/plan and initialize the run state',
    '  red <task-id>        run verification: it MUST fail (test targets new behavior)',
    '  green <task-id>      run verification: it MUST pass (after implementing)',
    '  refactor <task-id>   run verification: it MUST pass (behavior preserved)',
    '  status               show run state and the next action',
    '  verify               audit the evidence chain and run final verification',
    '  (none)               start if no run exists, otherwise show status',
    '',
    'Options:',
    '  --dry-run   (verify only) simulate the final verification',
    '  --json      output machine-readable run state or report',
    '  --help      Show this message',
    '',
  ].join('\n');
}
