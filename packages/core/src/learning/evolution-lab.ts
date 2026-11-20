// packages/core/src/learning/evolution-lab.ts
//
// M32 Evolution Lab: isolated experiment runner evaluating candidate Skill modifications
// against benchmark suites before any change can be promoted.
//
// Honest reporting (ADR-0018): when the benchmark environment cannot run
// an evaluation, the experiment is reported as 'not-run' with zeroed
// metrics. It is never reported as a completed experiment.

import type { ExperimentReport, SkillImprovementHypothesis } from '@agentic-sdlc-kit/contracts';

export interface BaselineEvaluation {
  readonly passRate: number;
  readonly tokens: number;
  /** Set when the benchmark environment cannot perform this evaluation. */
  readonly notImplemented?: boolean;
}

export interface CandidateEvaluation {
  readonly passRate: number;
  readonly tokens: number;
  readonly regressions: number;
  /** Set when the benchmark environment cannot perform this evaluation. */
  readonly notImplemented?: boolean;
}

export interface BenchmarkRunner {
  evaluateBaseline(hypothesis: SkillImprovementHypothesis): Promise<BaselineEvaluation>;
  evaluateCandidate(hypothesis: SkillImprovementHypothesis): Promise<CandidateEvaluation>;
}

export class EvolutionLab {
  async runExperiment(
    hypothesis: SkillImprovementHypothesis,
    runner: BenchmarkRunner,
  ): Promise<ExperimentReport> {
    const baseline = await runner.evaluateBaseline(hypothesis);
    const candidate = await runner.evaluateCandidate(hypothesis);

    if (baseline.notImplemented || candidate.notImplemented) {
      return {
        hypothesisId: hypothesis.id,
        baselinePassRate: 0,
        candidatePassRate: 0,
        heldOutGain: 0,
        learningCostTokens: 0,
        regressions: 0,
        verdict: 'not-run',
        completedAt: new Date().toISOString(),
      };
    }

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
