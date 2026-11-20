// packages/core/src/learning/memory-store.ts
//
// M29 Hierarchical Memory Store: stores and retrieves episodic, semantic,
// and procedural memory entries with domain indexing and relevance ranking.
//
// Persistence: the store can load from and save to .ai-kit/state/memory.json.
// This enables the learning loop to survive across sessions.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MemoryEntry, MemoryType } from '@agentic-sdlc-kit/contracts';

const MEMORY_FILE = 'state/memory.json';

/**
 * Wilson score interval lower bound (default z = 1.96, i.e. 95%).
 *
 * Used instead of the raw success ratio so that confidence is
 * sample-size aware: one success out of one application yields ~0.21,
 * not 1.0. A memory must earn trust with evidence volume (ADR-0018).
 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0 || successes < 0) return 0;
  const phat = Math.min(1, successes / total);
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = phat + z2 / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denominator);
}

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
    // Calibrated confidence: Wilson 95% lower bound, rounded to 4 decimals
    // to keep persisted values stable and human-readable.
    const confidence = Math.round(wilsonLowerBound(successCount, appliedCount) * 10_000) / 10_000;

    this.entries.set(id, {
      ...existing,
      appliedCount,
      successCount,
      confidence,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Persist all memory entries to .ai-kit/state/memory.json.
   * Writes atomically (tmp file + rename).
   */
  async saveToDisk(projectRoot: string): Promise<void> {
    const target = path.resolve(projectRoot, '.ai-kit', MEMORY_FILE);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const data = {
      schemaVersion: 1,
      entries: Array.from(this.entries.values()),
    };
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, target);
  }

  /**
   * Load memory entries from .ai-kit/state/memory.json.
   * Merges into the in-memory store (does not clear existing entries).
   * Returns the number of entries loaded.
   */
  async loadFromDisk(projectRoot: string): Promise<number> {
    const target = path.resolve(projectRoot, '.ai-kit', MEMORY_FILE);
    try {
      const raw = await fs.readFile(target, 'utf8');
      const data = JSON.parse(raw) as { entries: MemoryEntry[] };
      if (!data.entries || !Array.isArray(data.entries)) return 0;
      for (const entry of data.entries) {
        this.entries.set(entry.id, entry);
      }
      return data.entries.length;
    } catch {
      return 0; // file doesn't exist or is malformed; start empty
    }
  }

  /**
   * Clear all entries (for testing).
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Number of entries currently stored.
   */
  get size(): number {
    return this.entries.size;
  }
}
