// packages/cli/src/commands/doctor.test.ts
import { describe, expect, it } from 'vitest';
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

describe('doctorCommand', () => {
  it('prints the kit version and node version', async () => {
    const ctx = makeCtx();
    const r = await doctorCommand.run(ctx);
    expect(r.exitCode).toBeLessThanOrEqual(2); // 0 if healthy, 2 if not
    const text = ctx.out[0] ?? '';
    expect(text).toContain('kit 0.7.2');
    expect(text).toContain('node');
    expect(text).toContain('pnpm');
    expect(text).toContain('workspace');
    expect(text).toContain('Status:');
  });
});
