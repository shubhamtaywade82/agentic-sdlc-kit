// packages/cli/src/application/agent/execution-store.ts
//
// Persistence for agent execution records (ADR-0019 v2 revision A, PR3).
//
// The gateway — not the provider — owns the durable record of every
// execution: the ORIGINAL request (frozen before the provider is called,
// so it can never drift between attempts), the canonical policy snapshot
// it was granted under, every accepted lifecycle event, an audit trail of
// rejected/anomalous events, and the final result.
//
// SECURITY: resume tokens are CREDENTIALS (ADR-0020 §6). They are NEVER
// written here. A record that round-trips through this store must not
// contain a resume token anywhere; the gateway holds them in memory only.
//
// Records live at <projectRoot>/.ai-kit/state/agent-executions/<executionId>.json
// and are written atomically (tmp file + rename), like all kit state.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { kitStateRoot } from '@agentic-sdlc-kit/core';
import type {
  AgentExecutionEvent,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentExecutionStatus,
  AgentPolicySnapshot,
} from '@agentic-sdlc-kit/contracts';

/** Terminal-ish lifecycle of a stored execution. */
export type StoredExecutionStatus =
  | 'pending'
  | 'running'
  | AgentExecutionStatus; // completed | failed | cancelled | timed_out | interrupted | needs_approval

/** Why an event was rejected or flagged by the gateway (audit trail). */
export type EventAuditKind =
  | 'invalid-event' // did not parse against AgentExecutionEventSchema
  | 'wrong-execution-id' // event for a different execution
  | 'policy-hash-mismatch' // echo did not match the frozen policy (fail closed)
  | 'duplicate-event-id' // idempotent persistence skipped a repeat
  | 'sequence-anomaly'; // non-monotonic sequence: gap or regression (stored, but flagged)

export interface EventAuditNote {
  readonly kind: EventAuditKind;
  readonly at: string;
  readonly detail: string;
}

export interface StoredAgentExecution {
  readonly executionId: string;
  readonly workflowRunId: string;
  readonly taskId: string;
  readonly providerId: string;
  readonly policyHash: string;
  /** The canonical, versioned policy snapshot frozen for this execution. */
  readonly policySnapshot: AgentPolicySnapshot;
  /** The ORIGINAL request, frozen before the provider was called (rev A). */
  readonly request: AgentExecutionRequest;
  status: StoredExecutionStatus;
  /** 1 for a fresh start; each resume attempt increments. */
  attempts: number;
  /** Accepted (validated, policy-matched) events in arrival order. */
  events: AgentExecutionEvent[];
  /** Rejections and anomalies about individual events — the fail-closed paper trail. */
  eventAudit: EventAuditNote[];
  /** Gateway-level facts: budget breaches, result validation failures, drains. */
  gatewayNotes: string[];
  /** Final result verbatim from the provider, once terminal. */
  result?: AgentExecutionResult;
  /**
   * What the provider reported, when the gateway overrode it (e.g. the
   * duration budget expired after the provider claimed `completed`).
   * Undefined means the gateway accepted the provider's status as-is.
   */
  providerReportedStatus?: AgentExecutionStatus;
  readonly createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Execution ids become file names: keep them to safe characters. */
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateExecutionId(executionId: string): boolean {
  return EXECUTION_ID_PATTERN.test(executionId);
}

export function executionStoreDir(projectRoot: string): string {
  return path.join(kitStateRoot(projectRoot), 'state', 'agent-executions');
}

export function executionRecordPath(projectRoot: string, executionId: string): string {
  return path.join(executionStoreDir(projectRoot), `${executionId}.json`);
}

/** Atomic save (tmp + rename). Throws on I/O failure — callers decide. */
export async function saveExecution(
  projectRoot: string,
  execution: StoredAgentExecution,
): Promise<void> {
  if (!validateExecutionId(execution.executionId)) {
    throw new Error(`refusing to persist execution with unsafe id '${execution.executionId}'`);
  }
  const target = executionRecordPath(projectRoot, execution.executionId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(execution, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, target);
}

export async function loadExecution(
  projectRoot: string,
  executionId: string,
): Promise<StoredAgentExecution | undefined> {
  if (!validateExecutionId(executionId)) return undefined;
  try {
    const raw = JSON.parse(
      await fs.readFile(executionRecordPath(projectRoot, executionId), 'utf8'),
    ) as StoredAgentExecution;
    // Defensive shape check: the record must at least be about the id we
    // asked for. A corrupted record surfaces as undefined (missing), the
    // same as an absent one — the gateway never guesses.
    if (raw.executionId !== executionId || typeof raw.request !== 'object') return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export async function listExecutionIds(projectRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(executionStoreDir(projectRoot));
    return entries
      .filter((name) => name.endsWith('.json') && !name.endsWith('.tmp.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .filter(validateExecutionId)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Scan persisted records for a substring — used by the security test that
 * proves resume tokens never reach disk. Returns the file paths that
 * contain the needle.
 */
export async function findInExecutionRecords(
  projectRoot: string,
  needle: string,
): Promise<string[]> {
  const hits: string[] = [];
  for (const id of await listExecutionIds(projectRoot)) {
    const file = executionRecordPath(projectRoot, id);
    try {
      const content = await fs.readFile(file, 'utf8');
      if (content.includes(needle)) hits.push(file);
    } catch {
      // unreadable record: not a hit for this scan
    }
  }
  return hits;
}
