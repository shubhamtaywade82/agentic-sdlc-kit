// packages/core/src/learning/memory-store.ts
//
// M29 Hierarchical Memory Store: stores and retrieves episodic, semantic,
// and procedural memory entries with domain indexing and relevance ranking.

import type { MemoryEntry, MemoryType } from "@agentic-sdlc-kit/contracts";

export class MemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();

  put(entry: MemoryEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  list(type?: MemoryType): MemoryEntry[] {
    const all = Array.from(this.entries.values());
    if (!type) return all;
    return all.filter((e) => e.type === type);
  }

  search(query: string, domain?: string): MemoryEntry[] {
    const qLower = query.toLowerCase();
    return Array.from(this.entries.values())
      .filter((e) => {
        if (domain && e.domain !== domain) return false;
        return e.summary.toLowerCase().includes(qLower) || e.content.toLowerCase().includes(qLower);
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  recordApplication(id: string, succeeded: boolean): void {
    const existing = this.entries.get(id);
    if (!existing) return;
    const appliedCount = existing.appliedCount + 1;
    const successCount = existing.successCount + (succeeded ? 1 : 0);
    const confidence = Math.min(1, Math.max(0, successCount / appliedCount));

    this.entries.set(id, {
      ...existing,
      appliedCount,
      successCount,
      confidence,
      updatedAt: new Date().toISOString(),
    });
  }
}
