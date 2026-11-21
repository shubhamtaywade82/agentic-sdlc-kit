// packages/cli/src/commands/elicit.ts
//
// `kit elicit <FEATURE-ID> [--stack <a,b>] [--answers <file.json>] [--check] [--json]`
//
// Requirements elicitation. Interactive on a TTY: asks each unanswered question
// and saves after every answer. Non-interactive (--answers, or no TTY) never
// guesses: an unanswered blocking question fails the run. --check reports the
// gate without asking anything.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
  applicableQuestions,
  emptyRecord,
  gateStatus,
  QUESTION_BANK,
  recordAnswer,
  unanswered,
  type AnswerSource,
  type ElicitationRecord,
  type Question,
  type QuestionStack,
} from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

const FEATURE_ID = /^[A-Za-z][A-Za-z0-9-]{1,63}$/;
const KNOWN_STACKS: ReadonlySet<string> = new Set(['ruby-rails', 'node-typescript', 'react-typescript', 'python', 'go']);

const VALUE_FLAGS: ReadonlySet<string> = new Set(['--stack', '--answers']);

/** First argument that is neither a flag nor the value of a value-taking flag. */
function firstPositional(argv: ReadonlyArray<string>): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (VALUE_FLAGS.has(a)) {
      i += 1;
      continue;
    }
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

function flagValue(argv: ReadonlyArray<string>, flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

/** Stacks from --stack, else the `stack:` list in .ai-kit/project.yml. */
async function resolveStacks(ctx: CommandContext): Promise<{ stacks: QuestionStack[]; unknown: string[] }> {
  const flag = flagValue(ctx.argv, '--stack');
  let names: string[] = [];
  if (flag !== undefined) {
    names = flag.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const raw = await fs.readFile(path.join(ctx.cwd, '.ai-kit', 'project.yml'), 'utf8').catch(() => '');
    names = [...raw.matchAll(/^\s*-\s+([a-z-]+)\s*$/gm)].map((m) => m[1] as string);
  }
  const unknown = names.filter((n) => !KNOWN_STACKS.has(n));
  return { stacks: names.filter((n) => KNOWN_STACKS.has(n)) as QuestionStack[], unknown };
}

async function loadRecord(file: string, featureId: string): Promise<ElicitationRecord> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as ElicitationRecord;
  } catch {
    return emptyRecord(featureId);
  }
}

async function saveRecord(file: string, record: ElicitationRecord): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(record, null, 2) + '\n', 'utf8');
}

/** Answers file: { "<questionId>": "value" } or { "<questionId>": { value, source } }. */
function parseAnswersFile(raw: string): Array<{ id: string; value: string; source: AnswerSource }> {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  return Object.entries(obj).map(([id, v]) => {
    if (typeof v === 'string') return { id, value: v, source: 'user' as const };
    const entry = v as { value?: unknown; source?: unknown };
    return {
      id,
      value: String(entry.value ?? ''),
      source: entry.source === 'assumption' ? ('assumption' as const) : ('user' as const),
    };
  });
}

function formatQuestion(q: Question): string {
  const opts = q.options.length > 0 ? `  [${q.options.join(' | ')}]` : '';
  const tag = q.blocking ? 'BLOCKING' : 'optional';
  return `\n${q.id} (${tag}): ${q.prompt}${opts}\n  why: ${q.why}`;
}

async function interactive(
  questions: Question[],
  file: string,
  record: ElicitationRecord,
  ctx: CommandContext,
): Promise<ElicitationRecord> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let current = record;
  try {
    for (const q of questions) {
      ctx.stdout(formatQuestion(q) + '\n');
      const answer = (await rl.question('> ')).trim();
      if (answer === '' || answer.toLowerCase() === 'skip') {
        if (q.blocking) ctx.stdout('  blocking question; it stays open until answered\n');
        continue;
      }
      const res = recordAnswer(current, QUESTION_BANK, q.id, answer, 'user', new Date());
      if (!res.ok) {
        ctx.stdout(`  not accepted: ${JSON.stringify(res.error)}\n`);
        continue;
      }
      current = res.record;
      await saveRecord(file, current);
    }
  } finally {
    rl.close();
  }
  return current;
}

function report(ctx: CommandContext, featureId: string, file: string, applicable: Question[], record: ElicitationRecord, json: boolean): number {
  const gate = gateStatus(applicable, record);
  if (json) {
    ctx.stdout(JSON.stringify({ featureId, record: file, gate, answered: record.answers.length }, null, 2) + '\n');
  } else {
    ctx.stdout(`elicitation ${featureId}: ${record.answers.length} answered; gate ${gate.open ? 'OPEN' : 'CLOSED'}\n`);
    for (const id of gate.missingBlocking) ctx.stdout(`  missing blocking answer: ${id}\n`);
    ctx.stdout(`record: ${file}\n`);
  }
  return gate.open ? 0 : 1;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const positional = firstPositional(ctx.argv);
  if (positional === undefined || !FEATURE_ID.test(positional)) {
    ctx.stderr('kit elicit: a feature id such as FEATURE-001 is required\n');
    return { exitCode: 1, message: 'missing feature id' };
  }
  const { stacks, unknown } = await resolveStacks(ctx);
  if (unknown.length > 0) {
    ctx.stderr(`kit elicit: unknown stack(s): ${unknown.join(', ')}\n`);
    return { exitCode: 1, message: 'unknown stack' };
  }
  const file = path.join(ctx.cwd, 'docs', 'specifications', 'features', positional, 'ELICITATION.json');
  const applicable = applicableQuestions(QUESTION_BANK, stacks);
  let record = await loadRecord(file, positional);
  const json = ctx.argv.includes('--json');

  if (ctx.argv.includes('--check')) {
    return { exitCode: report(ctx, positional, file, applicable, record, json) };
  }

  const answersPath = flagValue(ctx.argv, '--answers');
  if (answersPath !== undefined) {
    const entries = parseAnswersFile(await fs.readFile(path.resolve(ctx.cwd, answersPath), 'utf8'));
    let next = record;
    for (const e of entries) {
      const res = recordAnswer(next, QUESTION_BANK, e.id, e.value, e.source, new Date());
      if (!res.ok) {
        ctx.stderr(`kit elicit: rejected ${e.id}: ${JSON.stringify(res.error)} (nothing saved)\n`);
        return { exitCode: 1, message: 'answer rejected' };
      }
      next = res.record;
    }
    await saveRecord(file, next);
    return { exitCode: report(ctx, positional, file, applicable, next, json) };
  }

  const pending = unanswered(applicable, record);
  if (!process.stdin.isTTY) {
    ctx.stdout(`kit elicit: ${pending.length} question(s) pending; no TTY, so nothing was asked. Use --answers <file.json>.\n`);
    return { exitCode: report(ctx, positional, file, applicable, record, json) };
  }
  record = await interactive(pending, file, record, ctx);
  return { exitCode: report(ctx, positional, file, applicable, record, json) };
}

export const elicitCommand: Command = {
  name: 'elicit',
  summary: 'Elicit requirements for a feature: structured blocking questions, saved per answer.',
  run,
};
