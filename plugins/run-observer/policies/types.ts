// plugins/run-observer/policies/types.ts
//
// Local type surface for the run-observer plugin. VENDORED on purpose:
// a Claude Code plugin must be self-contained (a hooks module imports its
// own files by relative path and 'claude-code' — nothing else), so the
// plugin cannot import @agentic-sdlc-kit/contracts. These mirror the kit
// contracts (observer/*) and must stay compatible with them.

export type ObserverEventKind =
  | 'session-start'
  | 'session-end'
  | 'turn-start'
  | 'turn-step'
  | 'turn-complete'
  | 'agent-spawn'
  | 'agent-complete'
  | 'tool-call'
  | 'tool-result'
  | 'verification'
  | 'escalation'
  | 'failure'
  | 'blocked-action';

export interface ObserverEvent {
  schemaVersion: 1;
  id: string;
  // The run this event belongs to.
  runId: string;
  // The session this event belongs to (may differ from the run).
  sessionId?: string;
  // ISO 8601 timestamp.
  at: string;
  kind: ObserverEventKind;
  // The model and effort in effect when the event occurred (if applicable).
  model?: string;
  effort?: string;
  // Token usage (only where the host exposes it).
  tokensIn?: number;
  tokensOut?: number;
  // Estimated cost in arbitrary units (only where reliable data exists).
  estimatedCostUnits?: number;
  // A redacted summary of the event payload (never raw secrets).
  summary: string;
  // Whether telemetry for this event is partial (some fields missing).
  partial: boolean;
}

export interface RetentionPolicy {
  schemaVersion: 1;
  // How long to keep events (in days). 0 = delete immediately; -1 = keep forever.
  retainDays: number;
  // Maximum number of events per run before truncating (cap memory).
  maxEventsPerRun: number;
  // Whether to redact summaries (strip anything that looks like a path).
  redactSummaries: boolean;
  // Whether to drop token/cost data (privacy).
  dropUsageData: boolean;
  // Path patterns to never record in summaries.
  redactPathPatterns: string[];
}
