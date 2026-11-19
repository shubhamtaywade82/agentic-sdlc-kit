// packages/core/src/learning/evolution-lab.ts
//
// M32 Evolution Lab: isolated experiment runner evaluating candidate Skill modifications
// against benchmark suites before any change can be promoted.

import type { ExperimentReport, SkillImprovementHypothesis } from '@agentic-sdlc-kit/contracts';

export interface BenchmarkRunner {
  evaluateBaseline(
    hypothesis: SkillImprovementHypothesis,
  ): Promise<{ passRate: number; tokens: number }>;
  evaluateCandidate(
    hypothesis: SkillImprovementHypothesis,
  ): Promise<{ passRate: number; regressions: number; tokens: number }>;
}

export class EvolutionLab {
  async runExperiment(
    hypothesis: SkillImprovementHypothesis,
    runner: BenchmarkRunner,
  ): Promise<ExperimentReport> {
    const baseline = await runner.evaluateBaseline(hypothesis);
    const candidate = await runner.evaluateCandidate(hypothesis);

    const heldOutGain = candidate.passRate - baseline.passRate;
    const learningCostTokens = baseline.tokens + candidate.tokens;

    let verdict: ExperimentReport['verdict'] = 'inconclusive';
    if (candidate.regressions > 0 || heldOutGain < 0) {
      verdict = 'rejected';
    } else if (heldOutGain >= 0.1 && candidate.regressions === 0) {
      verdict = 'promoted';
    }

    return {
      hypothesisId: hypothesis.id,
      baselinePassRate: baseline.passRate,
      candidatePassRate: candidate.passRate,
      heldOutGain,
      learningCostTokens,
      regressions: candidate.regressions,
      verdict,
      completedAt: new Date().toISOString(),
    };
  }
}
