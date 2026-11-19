// packages/core/src/learning/distiller.ts
//
// M30 Knowledge Distiller: synthesizes reusable lessons and procedural rules
// from accumulated experience records and detected failure patterns.

import type { ExperienceRecord, MemoryEntry } from '@agentic-sdlc-kit/contracts';

export class KnowledgeDistiller {
  distillFromExperiences(records: readonly ExperienceRecord[]): MemoryEntry[] {
    const failures = records.filter((r) => r.outcome === 'failure');
    const lessons: MemoryEntry[] = [];

    if (failures.length >= 2) {
      const stacks = Array.from(new Set(failures.map((f) => f.stack)));
      const now = new Date().toISOString();

      lessons.push({
        id: `MEM-DISTILL-${Date.now()}`,
        type: 'semantic',
        domain: stacks[0] ?? 'general',
        summary: `Recurring failure pattern identified across ${failures.length} tasks`,
        content: `Tasks on stack '${stacks.join(', ')}' demonstrated recurring verification issues; enforce integration-boundary checks.`,
        confidence: 0.85,
        provenance: failures.map((f) => f.id),
        appliedCount: 0,
        successCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    return lessons;
  }
}
