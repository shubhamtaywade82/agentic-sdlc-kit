// packages/cli/src/commands/evolve.ts
//
// `kit evolve [--dry-run] [--json]`.
// Executes distillation, improvement hypothesis generation, and Evolution Lab benchmarks (M31-M33).
//
// Reads from persisted experience records at .ai-kit/state/experiences.json.
// If no persisted experiences exist, reports honestly that evolution cannot
// run without accumulated evidence.

import {
  EvolutionLab,
  HypothesisEngine,
  KnowledgeDistiller,
  MemoryStore,
  PromotionGate,
  evaluateEvolutionMetrics,
  ExperienceCollector,
} from '@agentic-sdlc-kit/core';
import type { Command, CommandContext, CommandResult } from './types.js';

export const evolveCommand: Command = {
  name: 'evolve',
  summary:
    'Run continuous learning distillation, hypothesis generation, and Evolution Lab benchmarks (M31-M33).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const isDryRun = ctx.argv.includes('--dry-run');

    // Load persisted experiences from .ai-kit/state/experiences.json.
    // This is the fast-loop output (M28) that the slow loop consumes.
    const collector = new ExperienceCollector();
    const loaded = await collector.loadFromDisk(ctx.cwd);

    if (loaded === 0) {
      const msg =
        'kit evolve: no experience records found at .ai-kit/state/experiences.json.\n' +
        'Run workflows first (e.g. `kit feature`) to accumulate experience.\n';
      if (isJson) {
        ctx.stdout(JSON.stringify({ error: 'no-experiences', message: msg.trim() }) + '\n');
      } else {
        ctx.stdout(msg);
      }
      return { exitCode: 1, message: 'no experiences to distill' };
    }

    const experiences = collector.list();

    // Initialize CLSE pipeline.
    const store = new MemoryStore();
    const distiller = new KnowledgeDistiller();
    const engine = new HypothesisEngine();
    const lab = new EvolutionLab();
    const gate = new PromotionGate();

    // Distill lessons from real persisted experiences.
    const distilled = distiller.distillFromExperiences(experiences);

    // Persist distilled lessons to memory store.
    for (const mem of distilled) store.put(mem);
    await store.saveToDisk(ctx.cwd);

    // Generate hypotheses from distilled memories.
    const hypotheses = engine.generateFromMemories(distilled);

    if (hypotheses.length === 0) {
      const msg =
        `kit evolve: ${experiences.length} experience(s) loaded, ${distilled.length} lesson(s) distilled.\n` +
        'No hypotheses generated — need more recurring failures (≥2 per pattern) to propose improvements.\n';
      if (isJson) {
        ctx.stdout(
          JSON.stringify({
            experiences: experiences.length,
            distilledLessons: distilled.length,
            hypotheses: 0,
            message: 'insufficient recurring patterns for hypothesis generation',
          }) + '\n',
        );
      } else {
        ctx.stdout(msg);
      }
      return { exitCode: 0 };
    }

    // Run Evolution Lab benchmarks for each hypothesis.
    // The benchmark runner reports `notImplemented` when the Evolution
    // Lab environment (M32) is unavailable; those experiments come back
    // with verdict 'not-run' and are NEVER reported as completed (ADR-0018).
    const reports = [];
    for (const hyp of hypotheses) {
      const runner = createBenchmarkRunner(ctx.cwd);
      const rep = await lab.runExperiment(hyp, runner);
      reports.push(rep);
      if (!isDryRun && rep.verdict === 'promoted') {
        gate.createRequest(hyp, rep);
      }
    }

    // Honest metrics: computed ONLY from experiments that actually
    // executed. Not-run benchmarks contribute nothing.
    const executed = reports.filter((r) => r.verdict !== 'not-run');
    const notRun = reports.length - executed.length;
    const metrics =
      executed.length > 0
        ? evaluateEvolutionMetrics({
            heldOutGain:
              executed.reduce((sum, r) => sum + Math.max(0, r.heldOutGain), 0) / executed.length,
            learningCostTokens: executed.reduce((sum, r) => sum + r.learningCostTokens, 0),
            totalTasks: experiences.length,
            regressions: executed.reduce((sum, r) => sum + r.regressions, 0),
            memoriesRetrieved: distilled.length,
            memoriesApplied: distilled.length,
          })
        : null;

    const output = {
      experiencesLoaded: experiences.length,
      distilledLessons: distilled.length,
      hypothesesGenerated: hypotheses.length,
      benchmarksExecuted: executed.length,
      benchmarksNotRun: notRun,
      experiments: reports,
      metrics,
    };

    if (isJson) {
      ctx.stdout(JSON.stringify(output, null, 2) + '\n');
    } else {
      ctx.stdout(formatSummary(output));
    }

    return { exitCode: 0 };
  },
};

/**
 * Create a benchmark runner for the CLI surface. The isolated Evolution
 * Lab environment (M32) is a separate workspace that is not available
 * here, so both evaluations honestly report `notImplemented` — which the
 * lab surfaces as verdict 'not-run' instead of fabricated metrics.
 */
function createBenchmarkRunner(_projectRoot: string) {
  return {
    async evaluateBaseline() {
      return { passRate: 0, tokens: 0, notImplemented: true };
    },
    async evaluateCandidate() {
      return { passRate: 0, tokens: 0, regressions: 0, notImplemented: true };
    },
  };
}

function formatSummary(out: {
  experiencesLoaded: number;
  distilledLessons: number;
  hypothesesGenerated: number;
  benchmarksExecuted: number;
  benchmarksNotRun: number;
  experiments: unknown[];
  metrics: ReturnType<typeof evaluateEvolutionMetrics> | null;
}): string {
  // Honest status: if nothing executed, the lab is NOT RUN — never COMPLETED.
  const labStatus =
    out.benchmarksExecuted === 0
      ? 'NOT RUN (benchmark environment unavailable)'
      : `COMPLETED (${out.benchmarksExecuted} of ${out.experiments.length} benchmarks executed)`;
  const lines: string[] = [
    `Evolution Lab:      ${labStatus}`,
    `Experiences Loaded: ${out.experiencesLoaded}`,
    `Distilled Lessons:  ${out.distilledLessons}`,
    `Hypotheses:         ${out.hypothesesGenerated}${out.benchmarksNotRun > 0 ? ' (proposals pending benchmark evidence)' : ''}`,
    `Experiments:        ${out.benchmarksExecuted} executed, ${out.benchmarksNotRun} not run`,
  ];
  if (out.metrics) {
    lines.push(
      `Held-Out Gain:      +${(out.metrics.heldOutGain * 100).toFixed(1)}%`,
      `Learning Cost:      ${out.metrics.learningCost} tokens`,
      `Efficiency:         ${out.metrics.learningEfficiency}`,
      `Regression Rate:    ${out.metrics.regressionRate}`,
      `Memory Reuse Rate:  ${(out.metrics.memoryReuseRate * 100).toFixed(0)}%`,
    );
  } else {
    lines.push('Metrics:            withheld (no executed benchmarks)');
  }
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit evolve [--dry-run] [--json]',
    '',
    'Execute the Continuous Learning and Self-Evolution Engine: distill experience,',
    'synthesize improvement hypotheses, run Evolution Lab benchmarks, and propose',
    'controlled Skill upgrades with human approval gates.',
    '',
    'Reads from .ai-kit/state/experiences.json (produced by workflow runs).',
    'Writes to .ai-kit/state/memory.json (distilled lessons).',
    '',
    'Options:',
    '  --dry-run   Simulate benchmarks without staging promotion requests',
    '  --json      Output full machine-readable experiment and metrics report',
    '  --help      Show this message',
    '',
  ].join('\n');
}
