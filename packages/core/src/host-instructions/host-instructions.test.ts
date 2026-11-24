// packages/core/src/host-instructions/host-instructions.test.ts
import { describe, expect, it } from 'vitest';
import {
  BLOCK_BEGIN,
  DEFAULT_SCOPE,
  HOST_IDS,
  inspectManaged,
  planHostTargets,
  protocolBlock,
  stripBlock,
  upsertBlock,
  withTrailer,
  type HostScope,
} from './index.js';

describe('protocolBlock', () => {
  it('encodes the gates the kit actually enforces', () => {
    const t = protocolBlock('codex');
    expect(t).toContain('KIT_HOST=codex');
    expect(t).toContain('kit next --json');
    expect(t).toContain('run.completed');
    expect(t).toContain('assertion');
    expect(t).toContain('kit journal <ID> --verify');
  });

  it('never routes defects through `kit fix` (it observes no failing test)', () => {
    expect(protocolBlock('codex')).toContain('Do not use `kit fix`');
    expect(protocolBlock('codex')).not.toMatch(/run `kit fix/);
  });
});

describe('planHostTargets', () => {
  it('every host has a surface at its default scope, with its own identity', () => {
    for (const host of HOST_IDS) {
      const targets = planHostTargets(host, DEFAULT_SCOPE[host]);
      expect(targets, host).not.toBeNull();
      for (const t of targets!) expect(t.content).toContain(`KIT_HOST=${host}`);
    }
  });

  it('refuses scopes a host has no surface for', () => {
    expect(planHostTargets('cursor', 'user')).toBeNull();
    expect(planHostTargets('aider', 'user')).toBeNull();
    expect(planHostTargets('agy', 'project')).toBeNull();
  });

  it('claude-code ships three slash commands and one skill, relative paths only', () => {
    const t = planHostTargets('claude-code', 'user')!;
    expect(t.map((x) => x.path).sort()).toEqual([
      '.claude/commands/kit-feature.md',
      '.claude/commands/kit-fix.md',
      '.claude/commands/kit-resume.md',
      '.claude/skills/agentic-sdlc-kit/SKILL.md',
    ]);
    for (const x of t) expect(x.path.startsWith('/')).toBe(false);
  });

  it('cursor rule is always-apply and shared-file hosts use blocks', () => {
    const cursor = planHostTargets('cursor', 'project')![0]!;
    expect(cursor.content.startsWith('---\ndescription:')).toBe(true);
    expect(cursor.content).toContain('alwaysApply: true');
    for (const h of ['codex', 'gemini', 'aider'] as const) {
      const scope: HostScope = DEFAULT_SCOPE[h];
      expect(planHostTargets(h, scope)![0]!.mode).toBe('block');
    }
  });
});

describe('managed whole files', () => {
  it('detects absent, unmodified, modified and foreign', () => {
    const body = withTrailer('hello\nworld');
    expect(inspectManaged(null)).toBe('absent');
    expect(inspectManaged(body)).toBe('unmodified');
    expect(inspectManaged(body.replace('hello', 'HELLO'))).toBe('modified');
    expect(inspectManaged('my own notes\n')).toBe('foreign');
  });
});

describe('managed blocks', () => {
  it('preserves user text, replaces in place, and is idempotent', () => {
    const first = upsertBlock('# Mine\nkeep me\n', 'v1');
    expect(first).toContain('keep me');
    const second = upsertBlock(first, 'v2');
    expect(second).toContain('v2');
    expect(second).not.toContain('v1');
    expect(second.split(BLOCK_BEGIN).length - 1).toBe(1);
    expect(upsertBlock(second, 'v2')).toBe(second);
    expect(stripBlock(second).trim()).toBe('# Mine\nkeep me');
  });

  it('creates the file content when none exists', () => {
    expect(upsertBlock(null, 'x')).toContain(BLOCK_BEGIN);
  });
});
