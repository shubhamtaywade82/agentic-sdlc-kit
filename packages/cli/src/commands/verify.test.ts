// packages/cli/src/commands/verify.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeProfileYaml } from '@agentic-sdlc-kit/core';
import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';
import { verifyCommand } from './verify.js';
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

describe('verifyCommand', () => {
  it('shows help when --help is passed', async () => {
    const ctx = makeCtx(['--help'], '/');
    const r = await verifyCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out[0]).toContain('Usage: kit verify');
  });

  it('fails if .ai-kit/project.yml does not exist', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-verify-empty-'));
    try {
      const ctx = makeCtx([], tmp);
      const r = await verifyCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.err[0]).toContain('Profile not found');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('executes configured verification commands and passes', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-verify-pass-'));
    try {
      const aiKitDir = path.join(tmp, '.ai-kit');
      await fs.mkdir(aiKitDir, { recursive: true });

      const profile: ProjectProfile = {
        schemaVersion: 1,
        name: 'test-cli-app',
        stack: ['node-typescript'],
        commands: {
          test: [['node', '-e', 'process.exit(0)']],
        },
      };
      await fs.writeFile(path.join(aiKitDir, 'project.yml'), serializeProfileYaml(profile), 'utf8');

      const ctx = makeCtx([], tmp);
      const r = await verifyCommand.run(ctx);
      expect(r.exitCode).toBe(0);
      expect(ctx.out[0]).toContain('Status:           PASSED');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('surfaces schema issues when the profile fails validation (no bare error)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-verify-schema-'));
    try {
      const aiKitDir = path.join(tmp, '.ai-kit');
      await fs.mkdir(aiKitDir, { recursive: true });
      // stack: [] violates the contract (min 1 entry) — the CLI must say
      // WHY, not just "failed schema validation".
      await fs.writeFile(
        path.join(aiKitDir, 'project.yml'),
        ['schemaVersion: 1', 'name: "x"', 'stack: []', ''].join('\n'),
        'utf8',
      );
      const ctx = makeCtx([], tmp);
      const r = await verifyCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.err[0]).toContain('failed schema validation');
      expect(ctx.err[0]).toContain('stack');
      expect(ctx.err[0]).toContain('at least one entry');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('hints at the expected commands shape when zero checks are configured', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-verify-zero-'));
    try {
      const aiKitDir = path.join(tmp, '.ai-kit');
      await fs.mkdir(aiKitDir, { recursive: true });
      const profile: ProjectProfile = {
        schemaVersion: 1,
        name: 'zero-checks-app',
        stack: ['node-typescript'],
        commands: {},
      };
      await fs.writeFile(path.join(aiKitDir, 'project.yml'), serializeProfileYaml(profile), 'utf8');

      const ctx = makeCtx([], tmp);
      const r = await verifyCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.out[0]).toContain('(none configured)');
      expect(ctx.out[0]).toContain('commands:');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('verifyCommand --strength (ADR-0022)', () => {
  it('fails closed with an honest error for a stack without a mutation adapter', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-cli-verify-strength-'));
    try {
      const aiKitDir = path.join(tmp, '.ai-kit');
      await fs.mkdir(aiKitDir, { recursive: true });
      const profile: ProjectProfile = {
        schemaVersion: 1,
        name: 'strength-cli-app',
        stack: ['cobol'], // no adapter — must fail honestly, never silently skip
        commands: { test: [['node', '-e', 'process.exit(0)']] },
      };
      await fs.writeFile(path.join(aiKitDir, 'project.yml'), serializeProfileYaml(profile), 'utf8');

      const ctx = makeCtx(['--strength'], tmp);
      const r = await verifyCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.err[0]).toContain('not supported');
      expect(ctx.err[0]).toContain('cobol');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('mentions --strength in help output', async () => {
    const ctx = makeCtx(['--help'], '/');
    await verifyCommand.run(ctx);
    expect(ctx.out[0]).toContain('--strength');
    expect(ctx.out[0]).toContain('ADR-0022');
  });
});
