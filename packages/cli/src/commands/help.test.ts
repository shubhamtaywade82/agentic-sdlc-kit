// packages/cli/src/commands/help.test.ts
import { describe, expect, it } from 'vitest';
import { makeHelpCommand } from './help.js';
import { createCommandRegistry } from '../application/registry.js';
import { versionCommand } from './version.js';
import { doctorCommand } from './doctor.js';
import type { CommandContext } from './types.js';

const makeCtx = (): CommandContext & { out: string[] } => {
  const out: string[] = [];
  return {
    argv: [],
    cwd: '/',
    stdout: (s) => void out.push(s),
    stderr: () => {},
    out,
  };
};

describe('helpCommand', () => {
  it('lists every registered command', () => {
    const reg = createCommandRegistry([versionCommand, doctorCommand]);
    const help = makeHelpCommand(reg);
    const ctx = makeCtx();
    const r = help.run(ctx);
    expect(r.exitCode).toBe(0);
    const text = ctx.out[0] ?? '';
    expect(text).toContain('version');
    expect(text).toContain('doctor');
    expect(text).toContain('USAGE');
    expect(text).toContain('FLAGS');
  });
});
