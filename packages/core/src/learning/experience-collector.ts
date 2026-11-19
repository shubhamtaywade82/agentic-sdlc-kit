// packages/core/src/learning/experience-collector.ts
//
// M28 Experience Collector: normalizes workflow results, verification reports,
// and human corrections into structured ExperienceRecords with secret redaction.
//
// Persistence: the collector can load from and save to .ai-kit/state/experiences.json.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ExperienceRecord, VerificationReport } from '@agentic-sdlc-kit/contracts';
import { redactSecrets } from '../secret-guard/redactor.js';
import type { RedactionPolicy } from '@agentic-sdlc-kit/contracts';

const DEFAULT_REDACTION_POLICY: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED:<kind>:<id>]',
  redactPartial: true,
  redactRepeated: true,
  maxInputBytes: 1_000_000,
  ignorePaths: [],
};

const EXPERIENCES_FILE = 'state/experiences.json';

function redact(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const result = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
  return result.redactedText;
}

export interface CollectorInput {
  readonly workflowId: string;
  readonly featureId: string;
  readonly stack: string;
  readonly phases: Array<{ name: string; status: 'passed' | 'failed'; durationMs: number }>;
  readonly verification?: VerificationReport;
  readonly humanCorrection?: string;
}

export class ExperienceCollector {
  private readonly records: ExperienceRecord[] = [];

  record(input: CollectorInput): ExperienceRecord {
    const isSuccess =
      input.phases.every((p) => p.status === 'passed') &&
      (!input.verification || input.verification.status === 'passed');

    const record: ExperienceRecord = {
      id: `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      workflowId: input.workflowId,
      featureId: input.featureId,
      stack: input.stack,
      outcome: isSuccess ? 'success' : 'failure',
      phases: input.phases,
      // Redact any failure summary and human correction text to prevent
      // secret leakage into learning records (M11 invariant).
      failureSummary: redact(
        input.verification?.status !== 'passed' ? input.verification?.status : undefined,
      ),
      humanCorrection: redact(input.humanCorrection),
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);
    return record;
  }

  list(): readonly ExperienceRecord[] {
    return [...this.records];
  }

  /**
   * Persist all experience records to .ai-kit/state/experiences.json.
   * Writes atomically (tmp file + rename).
   */
  async saveToDisk(projectRoot: string): Promise<void> {
    const target = path.resolve(projectRoot, '.ai-kit', EXPERIENCES_FILE);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const data = {
      schemaVersion: 1,
      records: this.records,
    };
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, target);
  }

  /**
   * Load experience records from .ai-kit/state/experiences.json.
   * Merges into the in-memory list (does not clear existing records).
   * Returns the number of records loaded.
   */
  async loadFromDisk(projectRoot: string): Promise<number> {
    const target = path.resolve(projectRoot, '.ai-kit', EXPERIENCES_FILE);
    try {
      const raw = await fs.readFile(target, 'utf8');
      const data = JSON.parse(raw) as { records: ExperienceRecord[] };
      if (!data.records || !Array.isArray(data.records)) return 0;
      for (const record of data.records) {
        this.records.push(record);
      }
      return data.records.length;
    } catch {
      return 0; // file doesn't exist or is malformed; start empty
    }
  }

  /**
   * Clear all records (for testing).
   */
  clear(): void {
    this.records.length = 0;
  }

  /**
   * Number of records currently stored.
   */
  get size(): number {
    return this.records.length;
  }
}
