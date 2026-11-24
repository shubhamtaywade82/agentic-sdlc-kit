// packages/cli/src/commands/host.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hostCommand } from './host.js';
import type { CommandContext } from './types.js';

let tmp: string;
let home: string;
let proj: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-host-'));
  home = path.join(tmp, 'home');
  proj = path.join(tmp, 'proj');
  await fs.mkdir(home);
  await fs.mkdir(proj);
});
afterEach(() => fs.rm(tmp, { recursive: true, force: true }));

const run = async (...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: CommandContext = {
    argv: [...argv, '--home', home, '--dir', proj],
    cwd: tmp,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
  };
  const r = await hostCommand.run(ctx);
  return { ...r, out: out.join('\n'), err: err.join('\n') };
};
const read = (p: string) => fs.readFile(p, 'utf8');
const exists = (p: string) => fs.stat(p).then(() => true, () => false);

describe('kit host', () => {
  it('list shows every host with its default scope', async () => {
    const r = await run('list');
    expect(r.exitCode).toBe(0);
    for (const h of ['claude-code', 'codex', 'cursor', 'agy', 'gemini', 'aider']) {
      expect(r.out).toContain(h);
    }
  });

  it('claude-code installs slash commands and a skill at user scope, nothing in the project', async () => {
    const r = await run('install', 'claude-code');
    expect(r.exitCode).toBe(0);
    const cmd = await read(path.join(home, '.claude/commands/kit-feature.md'));
    expect(cmd).toContain('$ARGUMENTS');
    expect(cmd).toContain('KIT_HOST=claude-code');
    expect(await exists(path.join(home, '.claude/skills/agentic-sdlc-kit/SKILL.md'))).toBe(true);
    expect(await fs.readdir(proj)).toEqual([]);
  });

  it('is idempotent: second install reports unchanged and rewrites nothing', async () => {
    await run('install', 'claude-code');
    const p = path.join(home, '.claude/commands/kit-fix.md');
    const before = await fs.stat(p);
    const r = await run('install', 'claude-code');
    expect(r.exitCode).toBe(0);
    expect(r.out).not.toMatch(/created|updated|refused/);
    expect((await fs.stat(p)).mtimeMs).toBe(before.mtimeMs);
  });

  it('refuses to overwrite an edited file; --force replaces it', async () => {
    await run('install', 'cursor');
    const p = path.join(proj, '.cursor/rules/sdlc.mdc');
    await fs.writeFile(p, (await read(p)).replace('kit doctor', 'MY OWN RULE'));
    const refused = await run('install', 'cursor');
    expect(refused.exitCode).toBe(1);
    expect(refused.out).toContain('refused');
    expect(await read(p)).toContain('MY OWN RULE');
    expect((await run('install', 'cursor', '--force')).exitCode).toBe(0);
    expect(await read(p)).not.toContain('MY OWN RULE');
  });

  it('refuses a pre-existing file the kit did not write', async () => {
    const p = path.join(home, '.gemini/skills/agentic-sdlc-kit/SKILL.md');
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, 'my skill');
    const r = await run('install', 'agy');
    expect(r.exitCode).toBe(1);
    expect(await read(p)).toBe('my skill');
  });

  it('shared files keep user text and only the managed block is replaced', async () => {
    const p = path.join(proj, 'AGENTS.md');
    await fs.writeFile(p, '# My project rules\nkeep me\n');
    expect((await run('install', 'codex', '--scope', 'project')).exitCode).toBe(0);
    const once = await read(p);
    expect(once).toContain('keep me');
    expect(once).toContain('KIT_HOST=codex');
    await run('install', 'codex', '--scope', 'project');
    expect(await read(p)).toBe(once);
  });

  it('dry-run writes nothing', async () => {
    const r = await run('install', 'all', '--dry-run');
    expect(r.exitCode).toBe(0);
    expect(r.out).toContain('dry run');
    expect(await fs.readdir(home)).toEqual([]);
    expect(await fs.readdir(proj)).toEqual([]);
  });

  it('rejects unknown hosts, bad scopes and scopes a host lacks', async () => {
    expect((await run('install', 'vim')).err).toContain("unknown host 'vim'");
    expect((await run('install', 'codex', '--scope', 'galaxy')).err).toContain('--scope');
    expect((await run('install', 'cursor', '--scope', 'user')).err).toContain('no user-scope');
  });

  it('install all uses each host default scope', async () => {
    const r = await run('install', 'all');
    expect(r.exitCode).toBe(0);
    expect(await exists(path.join(home, '.codex/AGENTS.md'))).toBe(true);
    expect(await exists(path.join(home, '.gemini/GEMINI.md'))).toBe(true);
    expect(await exists(path.join(proj, '.cursor/rules/sdlc.mdc'))).toBe(true);
    expect(await exists(path.join(proj, 'CONVENTIONS.md'))).toBe(true);
  });
});
