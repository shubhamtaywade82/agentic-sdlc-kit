// packages/core/src/learning/experience-collector.ts
//
// M28 Experience Collector: normalizes workflow results, verification reports,
// and human corrections into structured ExperienceRecords with secret redaction.
//
// Persistence: the collector can load from and save to .ai-kit/state/experiences.json.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ExperienceRecord, VerificationReport } from '@agentic-sdlc-kit/contracts';
import { DEFAULT_REDACTION_POLICY, redactSecrets } from '../secret-guard/redactor.js';

const EXPERIENCES_FILE = 'state/experiences.json';

/** Maximum length of a persisted failure summary (bounded evidence, not dumps). */
const FAILURE_SUMMARY_MAX_CHARS = 500;
/** Maximum length of a single check detail line inside the summary. */
const CHECK_DETAIL_MAX_CHARS = 200;

function redact(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const result = redactSecrets(text, DEFAULT_REDACTION_POLICY, 'tool-output');
  return result.redactedText;
}

function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
}

/**
 * Build a failure summary from the actual failing checks: check id plus
 * the first error line or output excerpt. This replaces the previous
 * bare status string (`"failed"`), which carried no evidence (ADR-0018).
 */
function buildFailureSummary(verification: VerificationReport | undefined): string | undefined {
  if (!verification || verification.status === 'passed') return undefined;

  const failedChecks = verification.checks.filter((c) => c.status === 'failed');
  const parts = failedChecks.map((c) => {
    const raw = c.errors?.[0] ?? c.evidence?.[0] ?? 'no output captured';
    const detail = firstLine(raw).slice(0, CHECK_DETAIL_MAX_CHARS);
    return `${c.id}: ${detail}`;
  });
  if (parts.length === 0) {
    parts.push(`${verification.status}: no failed-check detail captured`);
  }

  let summary = parts.join(' | ');
  if (summary.length > FAILURE_SUMMARY_MAX_CHARS) {
    summary = `${summary.slice(0, FAILURE_SUMMARY_MAX_CHARS)}…[truncated]`;
  }
  return redact(summary);
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
      // Bounded, redacted evidence from the failing checks (M11 + ADR-0018).
      failureSummary: buildFailureSummary(input.verification),
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
