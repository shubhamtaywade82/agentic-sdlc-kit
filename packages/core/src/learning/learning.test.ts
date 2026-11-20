// packages/core/src/learning/learning.test.ts
import { describe, expect, it } from 'vitest';
import {
  computeLearningEfficiency,
  evaluateEvolutionMetrics,
  EvolutionLab,
  ExperienceCollector,
  HypothesisEngine,
  KnowledgeDistiller,
  MemoryStore,
  PromotionGate,
} from './index.js';

describe('Continuous Learning and Self-Evolution Engine (M27-M35)', () => {
  it('collects and normalizes experience records (M28)', () => {
    const collector = new ExperienceCollector();
    const exp1 = collector.record({
      workflowId: 'WF-1',
      featureId: 'FEATURE-AUTH',
      stack: 'node-typescript',
      phases: [
        { name: 'spec', status: 'passed', durationMs: 100 },
        { name: 'tdd', status: 'failed', durationMs: 500 },
      ],
    });
    expect(exp1.outcome).toBe('failure');
    expect(collector.list()).toHaveLength(1);
  });

  it('stores, retrieves, and updates hierarchical memory confidence (M29)', () => {
    const store = new MemoryStore();
    store.put({
      id: 'MEM-001',
      type: 'semantic',
      domain: 'node-typescript',
      summary: 'Avoid synchronous FS calls in high throughput paths',
      content: 'Use fs.promises instead of sync APIs to prevent event loop blocking.',
      confidence: 0.9,
      provenance: ['EXP-1'],
      appliedCount: 0,
      successCount: 0,
      createdAt: 'now',
      updatedAt: 'now',
    });

    const results = store.search('synchronous', 'node-typescript');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('MEM-001');

    // Wilson 95% lower bound: one success out of one application is
    // ~0.21, not 1.0 — a memory must earn trust with sample size.
    store.recordApplication('MEM-001', true);
    expect(store.get('MEM-001')?.confidence).toBeCloseTo(0.2065, 3);

    for (let i = 0; i < 49; i++) store.recordApplication('MEM-001', true);
    const confident = store.get('MEM-001')?.confidence ?? 0;
    expect(confident).toBeGreaterThan(0.9);
    expect(confident).toBeLessThanOrEqual(1);
  });

  it('distills recurring failure patterns into semantic lessons (M30)', () => {
    const collector = new ExperienceCollector();
    collector.record({
      workflowId: 'WF-1',
      featureId: 'FEATURE-A',
      stack: 'ruby-rails',
      phases: [{ name: 'tdd', status: 'failed', durationMs: 300 }],
    });
    collector.record({
      workflowId: 'WF-2',
      featureId: 'FEATURE-B',
      stack: 'ruby-rails',
      phases: [{ name: 'tdd', status: 'failed', durationMs: 400 }],
    });

    const distiller = new KnowledgeDistiller();
    const lessons = distiller.distillFromExperiences(collector.list());
    expect(lessons).toHaveLength(1);
    // The distiller now produces phase-specific lessons derived from the
    // actual failure pattern (stack + phase), not a generic "Recurring
    // failure pattern" string.
    expect(lessons[0]?.summary).toContain('tdd failures');
    expect(lessons[0]?.summary).toContain('ruby-rails');
    expect(lessons[0]?.domain).toBe('ruby-rails');
  });

  it('generates improvement hypotheses from high-confidence memories (M31)', () => {
    const engine = new HypothesisEngine();
    const hypotheses = engine.generateFromMemories([
      {
        id: 'MEM-10',
        type: 'semantic',
        domain: 'general',
        summary: 'Missed integration tests cause regressions',
        content: 'Always check boundary integration tests.',
        confidence: 0.8,
        provenance: [],
        appliedCount: 5,
        successCount: 4,
        createdAt: 'now',
        updatedAt: 'now',
      },
    ]);
    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0]?.targetSkill).toBe('tdd-bdd');
  });

  it('captures failing-check evidence in failure summaries (M28)', () => {
    const collector = new ExperienceCollector();
    const exp = collector.record({
      workflowId: 'WF-9',
      featureId: 'FEATURE-X',
      stack: 'node-typescript',
      phases: [{ name: 'tdd', status: 'failed', durationMs: 120 }],
      verification: {
        schemaVersion: 1,
        runId: 'run-1',
        status: 'failed',
        checks: [
          {
            id: 'test',
            status: 'failed',
            command: ['node', '--test'],
            evidence: ['AssertionError: expected role count 3 to equal 5'],
          },
        ],
      },
    });
    expect(exp.outcome).toBe('failure');
    expect(exp.failureSummary).toBeDefined();
    expect(exp.failureSummary).toContain('test');
    expect(exp.failureSummary).toContain('AssertionError');
  });

  it('marks experiments not-run when the benchmark environment is unavailable (M32)', async () => {
    const lab = new EvolutionLab();
    const hypothesis = {
      id: 'HYP-009',
      targetSkill: 'tdd-bdd',
      problemObserved: 'Integration gap',
      proposedChange: 'Require boundary tests',
      expectedBenefit: 'Higher pass rate',
      riskLevel: 'low' as const,
      benchmarkTasks: ['TASK-A'],
    };
    const unavailableRunner = {
      async evaluateBaseline() {
        return { passRate: 0, tokens: 0, notImplemented: true };
      },
      async evaluateCandidate() {
        return { passRate: 0, tokens: 0, regressions: 0, notImplemented: true };
      },
    };

    const report = await lab.runExperiment(hypothesis, unavailableRunner);
    expect(report.verdict).toBe('not-run');
    expect(report.heldOutGain).toBe(0);
    expect(report.learningCostTokens).toBe(0);
  });

  it('runs evolution lab benchmark experiments and decides promotion (M32)', async () => {
    const lab = new EvolutionLab();
    const hypothesis = {
      id: 'HYP-001',
      targetSkill: 'tdd-bdd',
      problemObserved: 'Integration gap',
      proposedChange: 'Require boundary tests',
      expectedBenefit: 'Higher pass rate',
      riskLevel: 'low' as const,
      benchmarkTasks: ['TASK-A', 'TASK-B'],
    };

    const mockRunner = {
      async evaluateBaseline() {
        return { passRate: 0.6, tokens: 1000 };
      },
      async evaluateCandidate() {
        return { passRate: 0.8, regressions: 0, tokens: 1200 };
      },
    };

    const report = await lab.runExperiment(hypothesis, mockRunner);
    expect(report.verdict).toBe('promoted');
    expect(report.heldOutGain).toBeCloseTo(0.2);
    expect(report.regressions).toBe(0);
  });

  it('enforces human approval on promotion requests (M33)', () => {
    const gate = new PromotionGate();
    const req = gate.createRequest(
      {
        id: 'HYP-001',
        targetSkill: 'tdd-bdd',
        problemObserved: 'Gap',
        proposedChange: 'Fix',
        expectedBenefit: 'Gain',
        riskLevel: 'low',
        benchmarkTasks: ['T1'],
      },
      {
        hypothesisId: 'HYP-001',
        baselinePassRate: 0.5,
        candidatePassRate: 0.8,
        heldOutGain: 0.3,
        learningCostTokens: 500,
        regressions: 0,
        verdict: 'promoted',
        completedAt: 'now',
      },
    );

    expect(req).toBeDefined();
    expect(req?.status).toBe('pending_approval');

    const approved = gate.approve(req!.id, 'LeadArchitect');
    expect(approved?.status).toBe('approved');
    expect(approved?.approvedBy).toBe('LeadArchitect');
  });

  it('evaluates longitudinal learning efficiency metrics (M34/M35)', () => {
    const efficiency = computeLearningEfficiency(0.25, 5000);
    expect(efficiency).toBe(0.00005);

    const snapshot = evaluateEvolutionMetrics({
      heldOutGain: 0.2,
      learningCostTokens: 4000,
      totalTasks: 10,
      regressions: 0,
      memoriesRetrieved: 8,
      memoriesApplied: 6,
    });

    expect(snapshot.learningEfficiency).toBe(0.00005);
    expect(snapshot.regressionRate).toBe(0);
    expect(snapshot.memoryReuseRate).toBe(0.75);
  });
});
