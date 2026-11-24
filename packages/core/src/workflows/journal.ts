// packages/core/src/workflows/journal.ts
//
// Hash-chained execution journal (ADR-0021 §3): append-only, per-run
// event log at .ai-kit/journal/feature-runs/<featureId>.jsonl.
//
// Chain rule (contracts/src/observer/journal.ts): every event's `hash`
// is SHA-256 over the canonical serialization of the event without its
// `hash` field; `prevHash` links to the previous event ('GENESIS' for
// seq 0). `verifyJournal` recomputes the chain and reports the first
// violation: a gap, a reordering, a mutation, or a bad digest.
//
// The journal is observability, NEVER authority:
//   - an event never authorizes anything and never substitutes for
//     evidence records (the evidence gate in feature-workflow.ts is the
//     sole authority for phase advancement);
//   - journal write failures NEVER block the workflow — callers receive
//     an error Result and continue (the run-observer invariant:
//     telemetry must not block the chain);
//   - payload strings are re-redacted defensively at the boundary
//     (callers pass pre-redacted evidence; the journal assumes nothing).
//
// Single-writer model: the journal assumes one kit process drives a run
// at a time (the CLI is the only mutation path today). Concurrent
// writers may interleave lines; that is a documented limit, not a
// detected condition.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Errors,
  JOURNAL_SCHEMA_VERSION,
  JournalEventSchema,
  type JournalActor,
  type JournalEvent,
  type JournalEventKind,
  type Result,
} from '@agentic-sdlc-kit/contracts';
import { kitStateRoot } from './state-root.js';
import { DEFAULT_REDACTION_POLICY, redactSecrets } from '../secret-guard/redactor.js';

const JOURNAL_DIR = path.join('journal', 'feature-runs');

/** What the caller provides; seq/prevHash/hash are owned by the journal. */
export interface JournalAppendInput {
  readonly featureId: string;
  readonly taskId?: string;
  readonly kind: JournalEventKind;
  readonly actor: JournalActor;
  /** Pre-redacted, bounded detail. Strings are re-redacted defensively. */
  readonly payload: Record<string, unknown>;
  /** Defaults to now; overridable for deterministic tests. */
  readonly ts?: string;
}

export interface JournalVerification {
  readonly eventCount: number;
  /** The last verified hash — an anchor callers may record externally. */
  readonly lastHash: string | undefined;
}

export function journalPath(projectRoot: string, featureId: string): string {
  return path.join(kitStateRoot(projectRoot), JOURNAL_DIR, `${featureId}.jsonl`);
}

/**
 * Deterministic serialization: object keys sorted recursively, no
 * whitespace. Identical events serialize identically across kit
 * versions, so a chain verified today still verifies next year.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(',')}}`;
}

function eventDigest(event: Omit<JournalEvent, 'hash'>): string {
  return createHash('sha256').update(canonicalize(event), 'utf8').digest('hex');
}

/** Defensively redact every string in the payload at the boundary. */
function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] =
      typeof value === 'string'
        ? redactSecrets(value, DEFAULT_REDACTION_POLICY, 'tool-output').redactedText
        : value;
  }
  return out;
}

interface JournalTail {
  seq: number;
  hash: string;
}

/** Read the tail (last seq + hash) without parsing every event body. */
async function readTail(file: string): Promise<JournalTail | null> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return null; // no journal yet — genesis
  }
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1];
  if (last === undefined) return null;
  try {
    const parsed = JSON.parse(last) as { seq?: unknown; hash?: unknown };
    if (typeof parsed.seq === 'number' && typeof parsed.hash === 'string') {
      return { seq: parsed.seq, hash: parsed.hash };
    }
  } catch {
    // fall through: corrupt tail is surfaced by verifyJournal
  }
  return null;
}

/**
 * Append one event to the run's journal. NEVER throws: an IO failure is
 * returned as an error Result and the caller continues (observability
 * must not block the workflow). A corrupt or unreadable tail fails the
 * append rather than forking the chain onto an unverifiable base.
 */
export async function appendJournalEvent(
  projectRoot: string,
  input: JournalAppendInput,
): Promise<Result<JournalEvent>> {
  const file = journalPath(projectRoot, input.featureId);
  try {
    const tail = await readTail(file);
    const seq = tail ? tail.seq + 1 : 0;
    const event: Omit<JournalEvent, 'hash'> = {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      seq,
      ts: input.ts ?? new Date().toISOString(),
      featureId: input.featureId,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      kind: input.kind,
      actor: input.actor,
      payload: redactPayload(input.payload),
      prevHash: tail ? tail.hash : 'GENESIS',
    };
    const hash = eventDigest(event);
    const full: JournalEvent = { ...event, hash };
    // Validate against the wire contract before persisting: the journal
    // must never contain an event the contracts package would reject.
    const checked = JournalEventSchema.safeParse(full);
    if (!checked.success) {
      return {
        ok: false,
        error: Errors.contractInvalid(
          `Journal event failed its own contract for ${input.featureId} seq ${seq}: ` +
            checked.error.message,
        ),
      };
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(full)}\n`, 'utf8');
    return { ok: true, value: full };
  } catch (err) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Journal append failed for ${input.featureId} (${input.kind}): ${String(err)}`,
      ),
    };
  }
}

/** Read and validate every event of a run's journal. */
export async function readJournal(
  projectRoot: string,
  featureId: string,
): Promise<Result<JournalEvent[]>> {
  const file = journalPath(projectRoot, featureId);
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return {
      ok: false,
      error: Errors.contractInvalid(`No journal found for ${featureId} at ${file}`),
    };
  }
  const events: JournalEvent[] = [];
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  for (const [i, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line) as unknown;
      const checked = JournalEventSchema.safeParse(parsed);
      if (!checked.success) {
        return {
          ok: false,
          error: Errors.contractInvalid(
            `Journal ${featureId} line ${i + 1} violates the event contract`,
          ),
        };
      }
      events.push(checked.data);
    } catch {
      return {
        ok: false,
        error: Errors.contractInvalid(`Journal ${featureId} line ${i + 1} is not valid JSON`),
      };
    }
  }
  return { ok: true, value: events };
}

/**
 * Verify the chain: seq continuity from 0, prevHash linkage, and hash
 * recomputation for every event. Reports the first violation with its
 * seq. An empty-but-present journal verifies as valid with 0 events.
 *
 * Honest limit: this detects modification, insertion, and reordering.
 * Tail truncation is NOT detectable from the journal alone (ADR-0021
 * §3.4) — `lastHash` is returned so callers can anchor it externally.
 */
export async function verifyJournal(
  projectRoot: string,
  featureId: string,
): Promise<Result<JournalVerification>> {
  const eventsRes = await readJournal(projectRoot, featureId);
  if (!eventsRes.ok) return eventsRes;

  const events = eventsRes.value;
  let prevHash: string = 'GENESIS';
  let expectedSeq = 0;
  for (const e of events) {
    const violation = (reason: string): Result<never> => ({
      ok: false,
      error: Errors.contractInvalid(
        `Journal chain violation for ${featureId} at seq ${e.seq}: ${reason}`,
      ),
    });
    if (e.seq !== expectedSeq) {
      return violation(`expected seq ${expectedSeq} but found ${e.seq}`);
    }
    if (e.prevHash !== prevHash) {
      return violation(`prevHash does not link to the previous event's hash`);
    }
    const { hash, ...eventWithoutHash } = e;
    if (eventDigest(eventWithoutHash) !== hash) {
      return violation(`hash does not match the canonical serialization of the event`);
    }
    prevHash = hash;
    expectedSeq++;
  }
  return {
    ok: true,
    value: { eventCount: events.length, lastHash: events[events.length - 1]?.hash },
  };
}
