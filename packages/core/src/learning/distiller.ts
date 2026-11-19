// packages/core/src/learning/distiller.ts
//
// M30 Knowledge Distiller: synthesizes reusable lessons and procedural rules
// from accumulated experience records and detected failure patterns.
//
// The distiller analyzes failure patterns by:
// 1. Grouping failures by stack and phase.
// 2. Identifying which phases fail most frequently.
// 3. Producing targeted lessons per failure pattern.
// 4. Setting confidence based on the number of independent failures observed.

import type { ExperienceRecord, MemoryEntry } from '@agentic-sdlc-kit/contracts';

interface FailurePattern {
  stack: string;
  phase: string;
  count: number;
  episodeIds: string[];
}

function analyzeFailures(records: readonly ExperienceRecord[]): FailurePattern[] {
  const failures = records.filter((r) => r.outcome === 'failure');
  const patternMap = new Map<string, FailurePattern>();

  for (const f of failures) {
    for (const phase of f.phases) {
      if (phase.status !== 'failed') continue;
      const key = `${f.stack}:${phase.name}`;
      const existing = patternMap.get(key);
      if (existing) {
        existing.count++;
        existing.episodeIds.push(f.id);
      } else {
        patternMap.set(key, {
          stack: f.stack,
          phase: phase.name,
          count: 1,
          episodeIds: [f.id],
        });
      }
    }
  }

  return Array.from(patternMap.values());
}

function confidenceForCount(count: number): number {
  // 2 failures → 0.7 (probable)
  // 3-4 failures → 0.8 (probable→verified)
  // 5+ failures → 0.9 (verified)
  if (count >= 5) return 0.9;
  if (count >= 3) return 0.8;
  return 0.7;
}

function lessonForPattern(p: FailurePattern, now: string): MemoryEntry {
  const phaseSpecific =
    p.phase === 'verification'
      ? 'verification regressions — enforce integration-boundary checks before implementation'
      : p.phase === 'planning'
        ? 'planning gaps — require dependency graph validation before task execution'
        : p.phase === 'implementation'
          ? 'implementation errors — add focused test coverage before advancing tasks'
          : p.phase === 'specification'
            ? 'specification ambiguity — require measurable acceptance criteria before planning'
            : `recurring failures in the ${p.phase} phase — review the workflow for this stage`;

  return {
    id: `MEM-DISTILL-${now.replace(/[^0-9]/g, '')}-${p.stack}-${p.phase}`,
    type: 'semantic',
    domain: p.stack,
    summary: `${p.count} independent ${p.phase} failures on ${p.stack}`,
    content: `Tasks on stack '${p.stack}' demonstrated ${p.count} independent ${phaseSpecific}.`,
    confidence: confidenceForCount(p.count),
    provenance: p.episodeIds,
    appliedCount: 0,
    successCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export class KnowledgeDistiller {
  distillFromExperiences(records: readonly ExperienceRecord[]): MemoryEntry[] {
    const patterns = analyzeFailures(records);
    const now = new Date().toISOString();

    // Only produce lessons for patterns with at least 2 independent failures.
    // A single failure could be an anomaly; 2+ indicates a pattern.
    return patterns.filter((p) => p.count >= 2).map((p) => lessonForPattern(p, now));
  }
}
