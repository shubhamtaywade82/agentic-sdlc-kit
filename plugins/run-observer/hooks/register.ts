// plugins/run-observer/hooks/register.ts
//
// Run Observer Mod: collects session/turn/tool events into a TraceStore.
// Per ADR-0015: the trace store is in policies/ (pure, testable); the
// register function is thin.
//
// Per post-M7 §7 (M13): start with CLI observability. Build a dashboard
// only when the event model and actual usage justify it.
//
// Per RESEARCH.md §F (Mission Control reference): bounded state. The store
// caps the number of tracked events per run rather than retaining an
// unlimited history.

import type {
  RegisterFn,
  TurnStartEvent,
  TurnCompleteEvent,
  ToolCallEvent,
  SessionStartEvent,
} from '@agentic-sdlc-kit/mod-sdk';
import type { ObserverEvent, RetentionPolicy } from '@agentic-sdlc-kit/contracts';
import { TraceStore } from '../policies/trace-store.js';

const DEFAULT_POLICY: RetentionPolicy = {
  schemaVersion: 1,
  retainDays: 30,
  maxEventsPerRun: 10_000,
  redactSummaries: true,
  dropUsageData: false,
  redactPathPatterns: [],
};

function redactSummary(text: string, policy: RetentionPolicy): string {
  if (!policy.redactSummaries) return text;
  // Strip anything that looks like an absolute path.
  return text.replace(/\/(?:[^/\s]+\/)+[^/\s]+/g, '<path>');
}

export const register: RegisterFn = (on) => {
  // The store is per-session; in a real Mod the host provides a stable
  // store via $.state. For the contract surface we hold it in a closure.
  const store = new TraceStore(DEFAULT_POLICY);
  let currentRunId = 'RUN-0001';

  function record(
    kind: ObserverEvent['kind'],
    summary: string,
    extra: Partial<ObserverEvent> = {},
  ): void {
    const event: ObserverEvent = {
      schemaVersion: 1,
      id: store.nextEventId(),
      runId: extra.runId ?? currentRunId,
      at: new Date(0).toISOString(), // stable for tests; production uses real clock
      kind,
      summary: redactSummary(summary, DEFAULT_POLICY),
      partial: false,
      ...extra,
    };
    store.record(event);
  }

  on('session.start', async ($, e: SessionStartEvent, next) => {
    $.ui.log('run-observer: session started');
    record('session-start', `session=${e.sessionId ?? '<new>'}`);
    return next(e);
  });

  on('turn.start', async (_$, e: TurnStartEvent, next) => {
    if (e.runId) currentRunId = e.runId;
    record('turn-start', `run=${currentRunId}`);
    return next(e);
  });

  on('tool.call', async (_$, e: ToolCallEvent, next) => {
    const result = await next(e);
    record('tool-call', `tool=${e.tool}`);
    return result;
  });

  on('turn.complete', async ($, e: TurnCompleteEvent, next) => {
    record('turn-complete', `run=${e.runId ?? currentRunId}`, {
      ...(e.tokensIn !== undefined ? { tokensIn: e.tokensIn } : {}),
      ...(e.tokensOut !== undefined ? { tokensOut: e.tokensOut } : {}),
      ...(e.durationMs !== undefined ? {} : {}),
      partial: e.tokensIn === undefined,
    });
    // Expose the store via $.state so kit runs can read it.
    $.state.set('run-observer.store', store);
    return next(e);
  });
};
