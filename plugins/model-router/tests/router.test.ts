// plugins/model-router/tests/router.test.ts
import { describe, expect, it } from 'vitest';
import { route, findMatchingRule } from '../policies/router.js';
import { classifyComplexity, classifyRisk } from '../policies/classifier.js';
import type { RoutingPolicy, RoutingContext } from '@agentic-sdlc-kit/contracts';

const policy: RoutingPolicy = {
  schemaVersion: 1,
  id: 'test',
  version: '1.0.0',
  rules: [
    {
      id: 'R-simple',
      taskType: '*',
      complexity: 'low',
      risk: 'low',
      model: 'haiku',
      effort: 'low',
      verification: 'structural',
      reason: 'simple',
    },
    {
      id: 'R-critical',
      taskType: '*',
      complexity: '*',
      risk: 'critical',
      model: 'opus',
      effort: 'high',
      verification: 'mandatory-security',
      reason: 'critical risk',
    },
  ],
  defaultModel: 'sonnet',
  defaultEffort: 'medium',
  suggestOnly: false,
};

describe('classifyComplexity / classifyRisk', () => {
  it('classifies a 1-file non-sensitive task as low complexity, low risk', () => {
    expect(
      classifyComplexity({
        prompt: 'rename a variable',
        touchesProduction: false,
        destructive: false,
        securitySensitive: false,
        estimatedFileCount: 1,
      }),
    ).toBe('low');
    expect(
      classifyRisk({
        prompt: '',
        touchesProduction: false,
        destructive: false,
        securitySensitive: false,
        estimatedFileCount: 1,
      }),
    ).toBe('low');
  });
  it('classifies a production destructive task as critical risk regardless of complexity', () => {
    expect(
      classifyRisk({
        prompt: 'drop the users table',
        touchesProduction: true,
        destructive: true,
        securitySensitive: false,
        estimatedFileCount: 1,
      }),
    ).toBe('critical');
    expect(
      classifyComplexity({
        prompt: '',
        touchesProduction: true,
        destructive: true,
        securitySensitive: false,
        estimatedFileCount: 1,
      }),
    ).toBe('low');
  });
});

describe('route', () => {
  it('INVARIANT: preserves explicit user model selection', () => {
    const ctx: RoutingContext = {
      scope: 'main-turn',
      taskType: 'general',
      complexity: 'low',
      risk: 'critical',
      requiredCapabilities: [],
      explicitUserModel: 'haiku',
      explicitUserEffort: 'low',
      previousOutcome: 'none',
    };
    const d = route(ctx, policy);
    expect(d.model).toBe('haiku');
    expect(d.effort).toBe('low');
    expect(d.reason).toContain('explicit user model selection preserved');
  });

  it('matches the critical-risk rule', () => {
    const ctx: RoutingContext = {
      scope: 'main-turn',
      taskType: 'general',
      complexity: 'low',
      risk: 'critical',
      requiredCapabilities: [],
      previousOutcome: 'none',
    };
    const d = route(ctx, policy);
    expect(d.model).toBe('opus');
    expect(d.effort).toBe('high');
    expect(d.matchedRuleId).toBe('R-critical');
  });

  it('escalates effort to high when previous verification failed', () => {
    const ctx: RoutingContext = {
      scope: 'main-turn',
      taskType: 'general',
      complexity: 'medium',
      risk: 'medium',
      requiredCapabilities: [],
      previousOutcome: 'failed-verification',
    };
    const d = route(ctx, policy);
    expect(d.isEscalation).toBe(true);
    expect(d.effort).toBe('high');
  });

  it('falls back to default model + effort when no rule matches', () => {
    const ctx: RoutingContext = {
      scope: 'main-turn',
      taskType: 'general',
      complexity: 'high',
      risk: 'medium',
      requiredCapabilities: [],
      previousOutcome: 'none',
    };
    const d = route(ctx, policy);
    expect(d.model).toBe('sonnet');
    expect(d.effort).toBe('medium');
  });
});

describe('findMatchingRule', () => {
  it('returns the first matching rule', () => {
    const ctx: RoutingContext = {
      scope: 'main-turn',
      taskType: 'general',
      complexity: 'low',
      risk: 'low',
      requiredCapabilities: [],
      previousOutcome: 'none',
    };
    const r = findMatchingRule(ctx, policy);
    expect(r?.id).toBe('R-simple');
  });
});
