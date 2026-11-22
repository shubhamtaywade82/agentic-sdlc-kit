// packages/cli/src/commands/journal.ts
//
// `kit journal <feature-id> [--verify] [--json] [--limit N]`
//
// Read and verify the hash-chained execution journal (ADR-0021 §3),
// persisted at .ai-kit/journal/feature-runs/<featureId>.jsonl.
//
// The journal is the EXECUTED record — what happened, in order, with a
// tamper-evident hash chain. The run state remains the authority for
// phase advancement; this command observes, it never decides.
//
// Honest limits: --verify detects modification, insertion, and
// reordering. Tail truncation is NOT detectable from the journal alone
// (ADR-0021 §3.4); the verification output includes the last verified
// hash so it can be anchored externally.

import path from 'node:path';
import { readJournal, verifyJournal } from '@agentic-sdlc-kit/core';
import type { JournalEvent } from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

const DEFAULT_HUMAN_LIMIT = 50;

function fail(ctx: CommandContext, message: string): CommandResult {
  ctx.stderr(`kit journal: ${message}\n`);
  return { exitCode: 1, message };
}

export const journalCommand: Command = {
  name: 'journal',
  summary: 'Read or verify the hash-chained execution journal for a feature run (ADR-0021).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const verify = ctx.argv.includes('--verify');
    const positional = ctx.argv.filter((a) => !a.startsWith('-'));
    const featureId = positional[0];
    if (!featureId) {
      return fail(ctx, 'missing required feature identifier (e.g. FEATURE-001)');
    }
    const root = path.resolve(ctx.cwd, '.');

    if (verify) {
      const res = await verifyJournal(root, featureId);
      if (!res.ok) return fail(ctx, res.error.message);
      if (isJson) {
        ctx.stdout(JSON.stringify({ featureId, valid: true, ...res.value }, null, 2) + '\n');
      } else {
        const hash = res.value.lastHash ? ` (last hash ${res.value.lastHash.slice(0, 12)}…)` : '';
        ctx.stdout(`Journal verified for ${featureId}: ${res.value.eventCount} event(s)${hash}\n`);
      }
      return { exitCode: 0 };
    }

    const res = await readJournal(root, featureId);
    if (!res.ok) return fail(ctx, res.error.message);
    const events = res.value;

    if (isJson) {
      ctx.stdout(JSON.stringify(events, null, 2) + '\n');
      return { exitCode: 0 };
    }

    const limitIdx = ctx.argv.indexOf('--limit');
    const limitArg = limitIdx >= 0 ? ctx.argv[limitIdx + 1] : undefined;
    const limit =
      limitArg && Number.isInteger(Number(limitArg)) && Number(limitArg) > 0
        ? Number(limitArg)
        : DEFAULT_HUMAN_LIMIT;
    const shown = events.slice(-limit);
    if (shown.length < events.length) {
      ctx.stdout(`… ${events.length - shown.length} earlier event(s) hidden (use --limit) …\n`);
    }
    for (const event of shown) {
      ctx.stdout(formatEvent(event));
    }
    if (events.length === 0) {
      ctx.stdout(`Journal for ${featureId} is empty.\n`);
    }
    return { exitCode: 0 };
  },
};

function formatEvent(event: JournalEvent): string {
  const actor =
    event.actor.host !== undefined ? `${event.actor.kind}:${event.actor.host}` : event.actor.kind;
  const task = event.taskId !== undefined ? ` ${event.taskId}` : '';
  const detail = Object.entries(event.payload)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return `[${event.seq}] ${event.ts} ${event.kind}${task} (${actor})${detail ? ` ${detail}` : ''}\n`;
}

function formatHelp(): string {
  return [
    'Usage: kit journal <feature-id> [--verify] [--json] [--limit N]',
    '',
    'Read or verify the hash-chained execution journal for a feature run:',
    'every workflow event, in order, with a tamper-evident hash chain',
    '(ADR-0021). The journal observes; it never decides.',
    '',
    'Options:',
    '  --verify  verify the chain (seq continuity + hash linkage + digests)',
    '  --json    machine-readable events (or verification result)',
    '  --limit N list only the last N events (default 50, human output only)',
    '  --help    Show this message',
    '',
    'Exit codes:',
    '  0  listed or verified',
    '  1  error: journal missing, unreadable, or (with --verify) chain violated',
    '',
  ].join('\n');
}
