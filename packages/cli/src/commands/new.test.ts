// packages/cli/src/commands/new.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newCommand } from './new.js';
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

describe('newCommand', () => {
  it('shows help when --help is passed', async () => {
    const ctx = makeCtx(['--help'], '/');
    const r = await newCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain('Usage: kit new');
  });

  it('scaffolds greenfield app in target directory', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-new-'));
    try {
      const ctx = makeCtx(['crypto-trader', '--dir', tmp], tmp);
      const r = await newCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('Application:   crypto-trader');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
