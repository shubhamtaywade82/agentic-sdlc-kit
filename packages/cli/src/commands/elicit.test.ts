import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, type TempDir } from '@agentic-sdlc-kit/testing';
import { elicitCommand } from './elicit.js';
import type { CommandContext } from './types.js';

const ctxFor = (argv: string[], cwd: string) => {
  const out: string[] = [];
  const err: string[] = [];
  const c: CommandContext & { out: string[]; err: string[] } = {
    argv,
    cwd,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    out,
    err,
  };
  return c;
};

const record = (cwd: string) =>
  path.join(cwd, 'docs', 'specifications', 'features', 'FEATURE-001', 'ELICITATION.json');

const exists = (p: string) => fs.access(p).then(() => true, () => false);

const BLOCKING_ANSWERS = {
  users: 'Merchants',
  done: 'Refund request returns 201 and a ledger row',
  'data-sensitivity': 'payment-data',
  'auth-change': 'no',
  'production-impact': 'yes',
  rollback: 'feature-flag',
};

describe('kit elicit', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await makeTempDir('kit-elicit-');
    await fs.mkdir(path.join(dir.path, '.ai-kit'), { recursive: true });
    await fs.writeFile(
      path.join(dir.path, '.ai-kit', 'project.yml'),
      'schemaVersion: 1\nname: shop\nstack:\n  - ruby-rails\ncommands: {}\n',
    );
  });
  afterEach(async () => dir.cleanup());

  it('closes the gate and names the missing blocking questions', async () => {
    const c = ctxFor(['FEATURE-001', '--check'], dir.path);
    expect((await elicitCommand.run(c)).exitCode).toBe(1);
    expect(c.out.join('')).toMatch(/missing blocking answer: users/);
    expect(c.out.join('')).toMatch(/missing blocking answer: rails-surface/);
  });

  it('opens the gate once every applicable blocking question is answered by a user', async () => {
    const answers = path.join(dir.path, 'answers.json');
    await fs.writeFile(
      answers,
      JSON.stringify({ ...BLOCKING_ANSWERS, 'rails-surface': 'hotwire', 'schema-change': 'additive' }),
    );
    const c = ctxFor(['FEATURE-001', '--answers', 'answers.json'], dir.path);
    expect((await elicitCommand.run(c)).exitCode).toBe(0);
    expect(c.out.join('')).toMatch(/gate OPEN/);
    expect(await exists(record(dir.path))).toBe(true);
  });

  it('rejects an assumption for a blocking question and saves nothing', async () => {
    const answers = path.join(dir.path, 'answers.json');
    await fs.writeFile(answers, JSON.stringify({ users: { value: 'guess', source: 'assumption' } }));
    const c = ctxFor(['FEATURE-001', '--answers', 'answers.json'], dir.path);
    expect((await elicitCommand.run(c)).exitCode).toBe(1);
    expect(c.err.join('')).toMatch(/assumption-not-allowed/);
    expect(await exists(record(dir.path))).toBe(false);
  });

  it('is all-or-nothing: one invalid option leaves the file unwritten', async () => {
    const answers = path.join(dir.path, 'answers.json');
    await fs.writeFile(answers, JSON.stringify({ ...BLOCKING_ANSWERS, 'data-sensitivity': 'gossip' }));
    const c = ctxFor(['FEATURE-001', '--answers', 'answers.json'], dir.path);
    expect((await elicitCommand.run(c)).exitCode).toBe(1);
    expect(c.err.join('')).toMatch(/invalid-option/);
    expect(await exists(record(dir.path))).toBe(false);
  });

  it('accepts an explicit assumption for a non-blocking question', async () => {
    const answers = path.join(dir.path, 'answers.json');
    await fs.writeFile(answers, JSON.stringify({ observability: { value: 'request latency', source: 'assumption' } }));
    const c = ctxFor(['FEATURE-001', '--answers', 'answers.json'], dir.path);
    await elicitCommand.run(c);
    const saved = JSON.parse(await fs.readFile(record(dir.path), 'utf8')) as { answers: Array<{ source: string }> };
    expect(saved.answers[0]?.source).toBe('assumption');
  });

  it('never guesses without a TTY: reports pending questions and exits 1', async () => {
    const c = ctxFor(['FEATURE-001'], dir.path);
    expect((await elicitCommand.run(c)).exitCode).toBe(1);
    expect(c.out.join('')).toMatch(/no TTY, so nothing was asked/);
  });

  it('rejects a missing or malformed feature id', async () => {
    expect((await elicitCommand.run(ctxFor([], dir.path))).exitCode).toBe(1);
    expect((await elicitCommand.run(ctxFor(['../../etc'], dir.path))).exitCode).toBe(1);
  });

  it('rejects an unknown stack name', async () => {
    const c = ctxFor(['FEATURE-001', '--stack', 'cobol'], dir.path);
    expect((await elicitCommand.run(c)).exitCode).toBe(1);
    expect(c.err.join('')).toMatch(/unknown stack/);
  });
});
