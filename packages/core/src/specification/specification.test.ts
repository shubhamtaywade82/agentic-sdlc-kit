// packages/core/src/specification/specification.test.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadSpecification,
  parseBddScenarios,
  scaffoldSpecification,
  validateSpecification,
} from './index.js';

describe('validateSpecification', () => {
  const validSpec = {
    id: 'FEATURE-001',
    title: 'Test Feature',
    overview: 'Provides test capability',
    problem: 'Need test capability',
    scope: {
      in: ['Capability A'],
      out: ['Capability B'],
    },
    actors: [{ name: 'User', role: 'Operator' }],
    functionalRequirements: [{ id: 'REQ-001', statement: 'Must work properly' }],
    nonFunctionalRequirements: [{ id: 'NFR-001', statement: 'Fast execution' }],
    acceptanceCriteria: [{ id: 'ACC-001', criterion: 'Returns valid response' }],
    edgeCases: ['Network failure'],
    dependencies: ['Core db'],
    risks: [{ id: 'RISK-001', severity: 'low' as const, description: 'Minor latency' }],
    openQuestions: [{ id: 'Q-001', question: 'Timeout limit?', resolved: true }],
  };

  it('validates a complete specification', () => {
    const res = validateSpecification(validSpec);
    expect(res.ok).toBe(true);
  });

  it('fails when duplicate requirement IDs exist', () => {
    const dup = {
      ...validSpec,
      functionalRequirements: [
        { id: 'REQ-001', statement: 'First' },
        { id: 'REQ-001', statement: 'Duplicate' },
      ],
    };
    const res = validateSpecification(dup);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Duplicate requirement ID');
    }
  });

  it('fails when scope.out is empty', () => {
    const noOut = { ...validSpec, scope: { in: ['Only in'], out: [] } };
    const res = validateSpecification(noOut);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Out-of-scope list must not be empty');
    }
  });

  it('fails when high risk exists with unresolved open questions', () => {
    const risky = {
      ...validSpec,
      risks: [{ id: 'RISK-001', severity: 'high' as const, description: 'Catastrophic' }],
      openQuestions: [{ id: 'Q-001', question: 'Unknown architecture?', resolved: false }],
    };
    const res = validateSpecification(risky);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('remains unresolved');
    }
  });
});

describe('scaffolder and parser', () => {
  it('scaffolds and loads specification successfully', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-spec-test-'));
    try {
      const featureDir = await scaffoldSpecification({
        id: 'FEATURE-101',
        title: 'Order Execution',
        targetDir: tmp,
      });

      const loaded = await loadSpecification(featureDir);
      expect(loaded.ok).toBe(true);
      if (loaded.ok) {
        expect(loaded.value.id).toBe('FEATURE-101');
        expect(loaded.value.title).toBe('Order Execution');
        expect(loaded.value.scope.in.length).toBeGreaterThan(0);
        expect(loaded.value.scope.out.length).toBeGreaterThan(0);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('parses BDD scenarios correctly', () => {
    const gherkin = `Feature: Authentication
  Scenario: Login success
    Given valid credentials
    When submitting credentials
    Then user is logged in
`;
    const scenarios = parseBddScenarios(gherkin);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]?.scenario).toBe('Login success');
    expect(scenarios[0]?.given).toEqual(['valid credentials']);
  });
});
