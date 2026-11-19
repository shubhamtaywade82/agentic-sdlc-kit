// packages/cli/src/commands/init.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initCommand } from './init.js';
import type { CommandContext } from './types.js';

const makeCtx = (
  argv: string[],
  cwd: string,
): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    cwd,
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    out,
    err,
  };
};

describe('initCommand', () => {
  it('shows help when --help is passed', async () => {
    const ctx = makeCtx(['--help'], '/');
    const r = await initCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain('Usage: kit init');
  });

  it('initializes project in a temp directory', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-init-test-'));
    try {
      await fs.writeFile(
        path.join(tmp, 'package.json'),
        JSON.stringify({ name: 'my-test-app', scripts: { test: 'node --test tests/' } }),
      );

      const ctx = makeCtx([], tmp);
      const r = await initCommand.run(ctx);
      expect(r.exitCode).toBe(0);

      const configPath = path.join(tmp, '.ai-kit', 'project.yml');
      const stat = await fs.stat(configPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(configPath, 'utf8');
      expect(content).toContain('schemaVersion: 1');
      expect(content).toContain(`name: ${path.basename(tmp).toLowerCase()}`);

      // Running again without --force must fail
      const r2 = await initCommand.run(ctx);
      expect(r2.exitCode).toBe(1);

      // Running with --force must succeed
      const ctxForce = makeCtx(['--force'], tmp);
      const r3 = await initCommand.run(ctxForce);
      expect(r3.exitCode).toBe(0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
