// packages/core/src/policy/policy-pack-evaluator.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateWithPack, findMatchingRule, ruleMatches } from './policy-pack-evaluator.js';
import type { ClassifiedAction, PolicyPack, PolicyRule } from '@agentic-sdlc-kit/contracts';

const destructiveRule: PolicyRule = {
  id: 'R-destructive',
  category: 'file.delete',
  impact: '*',
  verdict: 'require-approval',
  reason: 'destructive action',
};
const bulkRule: PolicyRule = {
  id: 'R-bulk',
  category: 'file.delete',
  impact: '*',
  verdict: 'deny',
  threshold: { field: 'fileCount', op: 'gt', value: 50 },
  reason: 'bulk delete above 50 files denied',
};
const readAllowRule: PolicyRule = {
  id: 'R-read',
  category: 'file.read',
  impact: '*',
  verdict: 'allow',
  reason: 'reads are safe',
};
const defaultDenyRule: PolicyRule = {
  id: 'R-default',
  category: '*',
  impact: '*',
  verdict: 'require-approval',
  reason: 'default deny-soft',
};

const testPack: PolicyPack = {
  schemaVersion: 1,
  id: 'test',
  version: '1.0.0',
  name: 'Test Pack',
  description: 'Test.',
  rules: [readAllowRule, bulkRule, destructiveRule],
  defaultVerdict: 'require-approval',
  appliesNonInteractive: false,
};

describe('ruleMatches', () => {
  it('matches a specific category', () => {
    const action: ClassifiedAction = {
      category: 'file.delete',
      impact: 'local',
      scope: { fileCount: 1, paths: ['x.ts'] },
    };
    expect(ruleMatches(action, destructiveRule)).toBe(true);
  });
  it('does NOT match a different category', () => {
    const action: ClassifiedAction = {
      category: 'file.read',
      impact: 'local',
      scope: {},
    };
    expect(ruleMatches(action, destructiveRule)).toBe(false);
  });
  it('matches a wildcard category', () => {
    const action: ClassifiedAction = {
      category: 'release.deploy',
      impact: 'production',
      scope: {},
    };
    expect(ruleMatches(action, defaultDenyRule)).toBe(true);
  });
  it('respects threshold: bulk rule does NOT match when fileCount <= 50', () => {
    const action: ClassifiedAction = {
      category: 'file.delete',
      impact: 'local',
      scope: { fileCount: 10, paths: [] },
    };
    expect(ruleMatches(action, bulkRule)).toBe(false);
  });
  it('respects threshold: bulk rule DOES match when fileCount > 50', () => {
    const action: ClassifiedAction = {
      category: 'file.delete',
      impact: 'local',
      scope: { fileCount: 100, paths: [] },
    };
    expect(ruleMatches(action, bulkRule)).toBe(true);
  });
});

describe('findMatchingRule', () => {
  it('returns the first matching rule', () => {
    const action: ClassifiedAction = {
      category: 'file.delete',
      impact: 'local',
      scope: { fileCount: 10, paths: [] },
    };
    const r = findMatchingRule(action, testPack);
    expect(r?.id).toBe('R-destructive'); // matches before bulk
  });
  it('returns undefined when no rule matches', () => {
    const action: ClassifiedAction = {
      category: 'git.push',
      impact: 'shared-branch',
      scope: {},
    };
    const r = findMatchingRule(action, testPack);
    expect(r).toBeUndefined();
  });
});

describe('evaluateWithPack', () => {
  it("returns the rule's verdict when a rule matches", () => {
    const action: ClassifiedAction = {
      category: 'file.read',
      impact: 'local',
      scope: {},
    };
    const d = evaluateWithPack(action, testPack, { interactive: true });
    expect(d.verdict).toBe('allow');
  });
  it('returns defaultVerdict when no rule matches', () => {
    const action: ClassifiedAction = {
      category: 'git.push',
      impact: 'shared-branch',
      scope: {},
    };
    const d = evaluateWithPack(action, testPack, { interactive: true });
    expect(d.verdict).toBe('require-approval');
  });
  it('INVARIANT: returns deny in non-interactive mode when pack does not apply', () => {
    const action: ClassifiedAction = {
      category: 'file.read',
      impact: 'local',
      scope: {},
    };
    const d = evaluateWithPack(action, testPack, { interactive: false });
    expect(d.verdict).toBe('deny');
  });
  it('applies rules in non-interactive mode when appliesNonInteractive=true', () => {
    const nonIntPack: PolicyPack = { ...testPack, appliesNonInteractive: true };
    const action: ClassifiedAction = {
      category: 'file.read',
      impact: 'local',
      scope: {},
    };
    const d = evaluateWithPack(action, nonIntPack, { interactive: false });
    expect(d.verdict).toBe('allow');
  });
});
