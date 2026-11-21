// packages/cli/src/application/agent/providers/claude-code/permission-config.test.ts
//
// ADR-0020 §3 POLICY PARITY TESTS (release blockers on failure).
//
// The two enforcement points — Kit's capability grant check and the
// generated Claude Code runtime representation — must produce EQUIVALENT
// decisions for identical policy inputs: a capability the snapshot did not
// grant yields NO allowing tool rule (and an explicit deny where the tool
// is unconditionally dangerous to leave ambiguous), and every Bash rule in
// the generated allowlist maps back to exactly the capability that produced
// it (single table, both directions — parity by construction, pinned here).

import { describe, expect, it } from 'vitest';
import { AGENT_CAPABILITIES, type AgentCapability } from '@agentic-sdlc-kit/contracts';
import {
  BASH_RULE_CAPABILITIES,
  bashRulesForCapability,
  deriveClaudeCodePermissionConfig,
  inferCapabilityFromBashCommand,
  inferCapabilityFromToolUse,
} from './permission-config.js';
import { buildClaudeArgv } from './claude-argv.js';

const ALL_TOOLS = [
  'Read', 'Grep', 'Glob', 'LS',
  'Write', 'Edit', 'NotebookEdit',
  'WebFetch', 'WebSearch',
  'Task',
];

function configFor(
  capabilities: readonly AgentCapability[],
  overrides: Partial<{ writablePaths: string[]; networkAllowed: boolean }> = {},
) {
  return deriveClaudeCodePermissionConfig(
    {
      capabilities,
      writablePaths: overrides.writablePaths ?? ['/ws/run-001'],
      networkAllowed: overrides.networkAllowed ?? false,
    },
    { maxToolCalls: 25 },
  );
}

describe('deriveClaudeCodePermissionConfig (ADR-0020 §2 generated representation)', () => {
  it('grants repository.read -> observation tools only', () => {
    const cfg = configFor(['repository.read']);
    expect(cfg.allowedTools).toEqual(expect.arrayContaining(['Read', 'Grep', 'Glob', 'LS']));
    expect(cfg.allowedTools).not.toContain('Write');
    expect(cfg.allowedTools).not.toContain('Edit');
  });

  it('scopes repository.write file tools to the granted writablePaths', () => {
    const cfg = configFor(['repository.read', 'repository.write'], {
      writablePaths: ['/ws/run-001', '/ws/shared'],
    });
    expect(cfg.allowedTools).toContain('Write(/ws/run-001/**)');
    expect(cfg.allowedTools).toContain('Edit(/ws/run-001/**)');
    expect(cfg.allowedTools).toContain('Write(/ws/shared/**)');
    // NO unscoped file mutation: an absolute-scope rule per path only.
    expect(cfg.allowedTools).not.toContain('Write');
    expect(cfg.allowedTools).not.toContain('Edit');
  });

  it('denies network tools when the capability is not granted (fail closed)', () => {
    const cfg = configFor(['repository.read']);
    expect(cfg.disallowedTools).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch']));
  });

  it('denies network tools even when granted if networkAllowed is false', () => {
    const cfg = configFor(['network.access'], { networkAllowed: false });
    expect(cfg.allowedTools).not.toContain('WebFetch');
    expect(cfg.disallowedTools).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch']));
  });

  it('allows network tools only when granted AND networkAllowed', () => {
    const cfg = configFor(['network.access'], { networkAllowed: true });
    expect(cfg.allowedTools).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch']));
  });

  it('always denies the Task subagent tool (one execution = ONE bounded agent)', () => {
    for (const capability of AGENT_CAPABILITIES) {
      expect(configFor([capability]).disallowedTools).toContain('Task');
    }
  });

  it('never generates bypassPermissions (ADR-0019 §6.5)', () => {
    for (const capability of AGENT_CAPABILITIES) {
      expect(configFor([capability]).permissionMode).not.toBe('bypassPermissions');
    }
  });

  it('derives maxTurns from the budget tool-call bound', () => {
    expect(configFor(['repository.read']).maxTurns).toBe(25);
    expect(
      deriveClaudeCodePermissionConfig(
        { capabilities: ['repository.read'], writablePaths: ['/ws'], networkAllowed: false },
        { maxToolCalls: 0 },
      ).maxTurns,
    ).toBeUndefined();
  });
});

describe('parity: grant <-> runtime representation equivalence (ADR-0020 §3)', () => {
  it('every capability denied by the grant is absent from the allowlist', () => {
    for (const granted of AGENT_CAPABILITIES) {
      const cfg = configFor([granted]);
      for (const denied of AGENT_CAPABILITIES) {
        if (denied === granted) continue;
        const rules = rulesOf(cfg.allowedTools, denied);
        expect(rules, `capability ${denied} leaked into allowlist when only ${granted} was granted`).toEqual([]);
      }
    }
  });

  it('every Bash rule in the allowlist maps back to the capability that produced it', () => {
    for (const capability of BASH_RULE_CAPABILITIES) {
      const cfg = configFor([capability]);
      const rules = cfg.allowedTools.filter((r) => r.startsWith('Bash('));
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        const prefix = rule.slice('Bash('.length, -':*)'.length);
        expect(inferCapabilityFromBashCommand(prefix)).toBe(capability);
      }
    }
  });

  it('round-trip: every table rule infers back to its own capability', () => {
    for (const capability of BASH_RULE_CAPABILITIES) {
      for (const rule of bashRulesForCapability(capability)) {
        expect(inferCapabilityFromBashCommand(rule.prefix)).toBe(capability);
      }
    }
  });

  it('more specific prefixes win: tsc --noEmit infers typecheck, not build', () => {
    expect(inferCapabilityFromBashCommand('tsc --noEmit --strict')).toBe('process.typecheck');
    expect(inferCapabilityFromBashCommand('tsc --build')).toBe('process.build');
  });

  it('unmapped Bash commands infer undefined (never a guessed capability)', () => {
    expect(inferCapabilityFromBashCommand('rm -rf /')).toBeUndefined();
    expect(inferCapabilityFromBashCommand('curl https://evil.example')).toBeUndefined();
  });

  it('tool-use inference mirrors the derivation table', () => {
    expect(inferCapabilityFromToolUse('Read', {})).toBe('repository.read');
    expect(inferCapabilityFromToolUse('Grep', {})).toBe('repository.read');
    expect(inferCapabilityFromToolUse('Edit', { file_path: '/x' })).toBe('repository.write');
    expect(inferCapabilityFromToolUse('Write', { file_path: '/x' })).toBe('repository.write');
    expect(inferCapabilityFromToolUse('WebFetch', { url: 'https://x' })).toBe('network.access');
    expect(inferCapabilityFromToolUse('Bash', { command: 'git status' })).toBe('git.read');
    expect(inferCapabilityFromToolUse('Bash', { command: 'pnpm test' })).toBe('process.test');
    expect(inferCapabilityFromToolUse('SomeNewTool', {})).toBeUndefined();
  });
});

describe('argv carries the generated representation, never a bypass', () => {
  it('includes derived flags and excludes permission bypasses', () => {
    const { args } = buildClaudeArgv(fakeRequest(['repository.read', 'repository.write', 'process.test']));
    const joined = args.join(' ');
    expect(joined).toContain('-p');
    expect(joined).toContain('--output-format stream-json');
    expect(joined).toContain('--verbose');
    expect(joined).toContain('--permission-mode default');
    expect(joined).toContain('--allowedTools');
    expect(joined).toContain('Write(/ws/run-001/**)');
    expect(joined).toContain('Bash(pnpm test:*)');
    expect(joined).toContain('--max-turns 40');
    expect(joined).not.toContain('bypassPermissions');
    expect(joined).not.toContain('--dangerously-skip-permissions');
    expect(joined).toContain('--disallowedTools');
    expect(joined).toContain('Task');
  });

  it('external.approval grants no tool (the approval policy governs it)', () => {
    const cfg = configFor(['external.approval']);
    const toolRules = cfg.allowedTools.filter((r) => ALL_TOOLS.some((t) => r === t || r.startsWith(`${t}(`)));
    expect(toolRules).toEqual([]);
  });
});

function rulesOf(allowedTools: readonly string[], capability: AgentCapability): string[] {
  const prefixes = bashRulesForCapability(capability).map((r) => `Bash(${r.prefix}:*)`);
  return allowedTools.filter((r) => prefixes.includes(r));
}

function fakeRequest(capabilities: AgentCapability[]) {
  return {
    schemaVersion: 2 as const,
    executionId: 'exec-RUN-001-TASK-001-red-1',
    workflowRunId: 'RUN-001',
    taskId: 'TASK-001',
    providerId: 'claude-code',
    taskKind: 'test_authoring' as const,
    policyHash: 'sha256:test-policy',
    workspace: {
      id: 'ws-run-001',
      kind: 'git-worktree' as const,
      rootPath: '/ws/run-001',
      branch: 'kit/RUN-001',
      baseCommitSha: 'a'.repeat(40),
      createdAt: new Date().toISOString(),
    },
    instructions: 'Write the failing test.',
    context: { relevantFiles: [], constraints: [] },
    permissions: {
      capabilities,
      writablePaths: ['/ws/run-001'],
      networkAllowed: false,
    },
    budget: {
      maxDurationMs: 60_000,
      maxToolCalls: 40,
    },
    approvalPolicy: {
      requireApprovalFor: ['external.approval'],
      allowAutonomousExecution: true,
    },
  };
}
