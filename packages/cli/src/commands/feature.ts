// packages/cli/src/commands/feature.ts
//
// `kit feature <feature-id> [--red|--green|--refactor <task-id>] [--status]
//            [--verify] [--dry-run] [--json]`.
//
// Phase-gated TDD driver. The CLI never writes implementation code: it
// verifies each Red/Green/Refactor gate against recorded evidence and tells
// the agent (human or AI) exactly what to do next. See
// core/workflows/feature-workflow.ts for the state machine.

import path from 'node:path';
import {
  runFeatureWorkflow,
  type FeatureAction,
  type FeatureRunReport,
} from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const featureCommand: Command = {
  name: 'feature',
  summary:
    'Drive the phase-gated incremental feature workflow (red -> green -> refactor per task).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const featureId = ctx.argv.find((a) => !a.startsWith('-'));
    if (!featureId) {
      ctx.stderr('kit feature: error: missing required feature identifier (e.g. FEATURE-001)\n');
      return { exitCode: 1, message: 'Missing feature ID' };
    }

    const isJson = ctx.argv.includes('--json');
    const isDryRun = ctx.argv.includes('--dry-run');

    // Resolve the gate: --red/--green/--refactor take a task id;
    // --status and --verify are standalone.
    let action: FeatureAction | undefined;
    let taskId: string | undefined;
    for (const gate of ['red', 'green', 'refactor'] as const) {
      const idx = ctx.argv.indexOf(`--${gate}`);
      if (idx !== -1) {
        action = gate;
        taskId = ctx.argv[idx + 1];
        if (!taskId || taskId.startsWith('-')) {
          ctx.stderr(
            `kit feature: error: --${gate} requires a task id (e.g. --${gate} TASK-101)\n`,
          );
          return { exitCode: 1, message: `Missing task id for --${gate}` };
        }
      }
    }
    if (!action && ctx.argv.includes('--status')) action = 'status';
    if (!action && ctx.argv.includes('--verify')) action = 'verify';

    const targetRoot = path.resolve(ctx.cwd, '.');
    const res = await runFeatureWorkflow({
      featureId,
      projectRoot: targetRoot,
      action,
      taskId,
      dryRun: isDryRun,
    });
    if (!res.ok) {
      ctx.stderr(`kit feature: workflow error: ${res.error.message}\n`);
      return { exitCode: 1, message: res.error.message };
    }

    if (isJson) {
      ctx.stdout(JSON.stringify(res.value, null, 2) + '\n');
    } else {
      ctx.stdout(formatSummary(res.value));
    }

    // Exit code: a failed final state is an error; gates that succeeded
    // (including "awaiting implementation") are not.
    return { exitCode: res.value.status === 'failed' ? 1 : 0 };
  },
};

function formatSummary(report: FeatureRunReport): string {
  const lines: string[] = [
    `Feature Workflow:  ${report.featureId} (${report.spec.title})`,
    `Status:            ${report.status.toUpperCase()}`,
    `Tasks:             ${report.tasksExecuted.length}/${report.tasksPlanned.length} completed with TDD evidence`,
  ];
  if (report.currentTaskId) {
    const current = report.tdd.find((t) => t.taskId === report.currentTaskId);
    lines.push(`Current Task:      ${report.currentTaskId} [${current?.phase ?? '?'}]`);
  }
  lines.push(`Tasks Planned:     ${report.tasksPlanned.join(', ')}`);
  if (report.tasksExecuted.length > 0) {
    lines.push(`Tasks Completed:   ${report.tasksExecuted.join(', ')}`);
  }
  if (report.tdd.length > 0) {
    lines.push('TDD Evidence:');
    for (const t of report.tdd) {
      const bits: string[] = [];
      if (t.red) bits.push(`red=${t.red.status}(${t.red.durationMs}ms)`);
      if (t.green) bits.push(`green=${t.green.status}`);
      if (t.refactor) bits.push(`refactor=${t.refactor.status}`);
      lines.push(
        `  - ${t.taskId.padEnd(10)} ${t.phase.padEnd(24)} ${bits.join(' ') || '(no evidence yet)'}`,
      );
    }
  }
  if (report.verification) {
    lines.push(
      `Verification:      ${report.verification.status.toUpperCase()} (${report.verification.checks.length} checks)`,
    );
  }
  lines.push(`Next:              ${report.nextAction}`);
  lines.push(`Total Duration:    ${report.durationMs}ms`);
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit feature <feature-id> [--red|--green|--refactor <task-id>] [--status]',
    '                  [--verify] [--dry-run] [--json]',
    '',
    'Drive an incremental feature through phase-gated TDD. The kit never writes',
    'implementation code: your agent writes the failing test, implements, and',
    'refactors; the kit verifies each gate and records the evidence.',
    '',
    'Gates:',
    '  (default)               start the run, or show current status',
    '  --red <task-id>         run the task verification; it MUST fail (proves the',
    '                          failing test exists) and advances to implementation',
    '  --green <task-id>       run it again after implementing; it MUST pass',
    '  --refactor <task-id>    run it once more; behavior must stay green;',
    '                          completes the task and moves to the next one',
    '  --status                show current task, phase, and recorded evidence',
    '  --verify                run the final regression (all profile commands);',
    '                          requires every task to have full TDD evidence',
    '',
    'State (incl. all evidence) is persisted under',
    '.ai-kit/state/feature-runs/<feature-id>.json.',
    '',
    'Options:',
    '  --dry-run   Show the plan without executing or changing anything',
    '  --json      Output machine-readable FeatureRunReport',
    '  --help      Show this message',
    '',
  ].join('\n');
}
