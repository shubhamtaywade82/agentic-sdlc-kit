// packages/core/src/learning/evaluation-metrics.ts
//
// M34/M35 Self-improvement evaluation and meta-evolution metrics.
// Computes Learning Efficiency = Held-out Performance Gain / Learning Cost.

export interface MetricSnapshot {
  readonly heldOutGain: number;
  readonly learningCost: number;
  readonly learningEfficiency: number;
  readonly regressionRate: number;
  readonly memoryReuseRate: number;
}

export function computeLearningEfficiency(heldOutGain: number, learningCost: number): number {
  if (learningCost <= 0) return 0;
  return Number((heldOutGain / learningCost).toFixed(6));
}

export function evaluateEvolutionMetrics(input: {
  heldOutGain: number;
  learningCostTokens: number;
  totalTasks: number;
  regressions: number;
  memoriesRetrieved: number;
  memoriesApplied: number;
}): MetricSnapshot {
  const learningEfficiency = computeLearningEfficiency(input.heldOutGain, input.learningCostTokens);
  const regressionRate =
    input.totalTasks > 0 ? Number((input.regressions / input.totalTasks).toFixed(4)) : 0;
  const memoryReuseRate =
    input.memoriesRetrieved > 0
      ? Number((input.memoriesApplied / input.memoriesRetrieved).toFixed(4))
      : 0;

  return {
    heldOutGain: input.heldOutGain,
    learningCost: input.learningCostTokens,
    learningEfficiency,
    regressionRate,
    memoryReuseRate,
  };
}
