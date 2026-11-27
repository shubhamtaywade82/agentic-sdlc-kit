// packages/cli/src/commands/next.ts
//
// `kit next [feature-id] [--json]` — the host-driven agent protocol
// entry point (ADR-0021 §2).
//
// A Tier C host (Cursor, AGY, CI, any terminal-capable agent) drives
// the entire TDD workflow with ONE loop:
//
//     while true:
//       action = kit next --json
//       if action.requiredAction == 'run.completed': stop
//       act on action.nextInvocation (write test / implement / refactor)
//       run action.nextInvocation
//
// The payload is bounded and machine-readable; the evidence gate, not
// this command, decides what advances. With no feature id, the command
// resolves the single active run; ambiguity is a blocked exit, never a
// guess.

import path from 'node:path';
import { computeNextAction, listFeatureRunStates, recordNextOffer } from '@agentic-sdlc-kit/core';
import type { NextAction } from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

function fail(ctx: CommandContext, message: string): CommandResult {
  ctx.stderr(`kit next: ${message}\n`);
  return { exitCode: 1, message };
}

function blocked(ctx: CommandContext, message: string): CommandResult {
  ctx.stderr(`kit next: ${message}\n`);
  return { exitCode: 3, message };
}

export const nextCommand: Command = {
  name: 'next',
  summary:
    'Show the next action for the active feature run (host-driven agent protocol, ADR-0021).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const positional = ctx.argv.filter((a) => !a.startsWith('-'));
    const root = path.resolve(ctx.cwd, '.');

    let featureId = positional[0];
    if (!featureId) {
      const runs = await listFeatureRunStates(root);
      const single = runs[0];
      if (single === undefined) {
        return blocked(
          ctx,
          'no active feature runs — start one with `kit feature <feature-id> start`',
        );
      }
      if (runs.length > 1) {
        const ids = runs.map((r) => r.featureId).join(', ');
        return blocked(
          ctx,
          `multiple active feature runs (${ids}) — specify one: \`kit next <feature-id>\``,
        );
      }
      featureId = single.featureId;
    }

    const res = await computeNextAction({ projectRoot: root, featureId });
    if (!res.ok) return fail(ctx, res.error.message);
    const action = res.value;
    // Trace only: a failed record must not block the protocol answer.
    await recordNextOffer(root, action);

    if (isJson) {
      ctx.stdout(JSON.stringify(action, null, 2) + '\n');
      return { exitCode: 0 };
    }
    ctx.stdout(formatHuman(action));
    return { exitCode: 0 };
  },
};

function formatHuman(action: NextAction): string {
  const lines: string[] = [
    `${action.featureId} (${action.status}): ${
      action.taskId ? `${action.taskId} ${action.phase}` : action.requiredAction
    }`,
    `Next: ${action.nextInvocation}`,
  ];
  if (action.verificationCommand.length > 0) {
    lines.push(`Verify with: ${action.verificationCommand.join(' ')}`);
  }
  if (action.blockingQuestions.length > 0) {
    lines.push('Waiting on a human:');
    for (const q of action.blockingQuestions) lines.push(`  - ${q}`);
  }
  if (action.advisoryLessons.length > 0) {
    lines.push('Advisory lessons (advice only, never authority):');
    for (const lesson of action.advisoryLessons) lines.push(`  - ${lesson.summary}`);
  }
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit next [feature-id] [--json]',
    '',
    'Show the next action for the active feature run — the host-driven agent',
    'protocol entry point (ADR-0021). Tier C hosts (Cursor, AGY, CI) loop:',
    'kit next --json, act, run nextInvocation, repeat.',
    '',
    'With no feature id: uses the single active run; zero or multiple active',
    'runs are a blocked exit (3), never a guess.',
    '',
    'Options:',
    '  --json   output the machine-readable NextAction payload',
    '  --help   Show this message',
    '',
    'Exit codes:',
    '  0  action resolved',
    '  1  error (corrupt state, diverged plan)',
    '  3  blocked: no active run, or multiple runs without a feature id',
    '',
  ].join('\n');
}
