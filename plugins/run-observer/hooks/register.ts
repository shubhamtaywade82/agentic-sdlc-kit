// plugins/run-observer/hooks/register.ts
//
// run-observer: execution telemetry. Records session/turn/tool events into
// a bounded in-memory TraceStore (per M13) and exposes it via $.state.
//
// Host contract (official docs, verified November 2026): turn.start
// carries e.turnId; turn.complete carries e.answer / e.durationMs /
// e.usage / e.isAborted / e.agentId; turn.step streams (async generator,
// `const result = yield* next(e)`) and its result carries usage + the
// model that answered; tool.call carries the tool's arguments as fields
// of e; timestamps come from $.clock.now() (the mock/old code froze `at`
// at the epoch — 1970-01-01 — which is exactly the fabricated-data bug
// this kit refuses to ship).
//
// An observer MUST NEVER BLOCK the chain: every handler body is wrapped
// in try/catch that swallows errors and logs a single notice, and next(e)
// always runs. No .catch is needed (nothing is denied).
//
// Static-analysis rules honored here: full $.x.y(...) calls;
// string-literal event names; `$` is never assigned or destructured, and
// is passed only to observe, a top-level function of this same file (the
// record helper takes plain values, not $).

import type {
  ModsApi,
  On,
  SessionStartEvent,
  ToolCallEvent,
  TurnCompleteEvent,
  TurnStartEvent,
  TurnStepEvent,
} from 'claude-code';
import { TraceStore } from '../policies/trace-store';
import type { ObserverEvent, ObserverEventKind, RetentionPolicy } from '../policies/types';

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

/** Record an event into the store. Takes plain values, never $. */
function record(
  store: TraceStore,
  runId: string,
  nowMs: number,
  kind: ObserverEventKind,
  summary: string,
  extra: Partial<ObserverEvent> = {},
): void {
  const event: ObserverEvent = {
    schemaVersion: 1,
    id: store.nextEventId(),
    runId,
    at: new Date(nowMs).toISOString(),
    kind,
    summary: redactSummary(summary, DEFAULT_POLICY),
    partial: false,
    ...extra,
  };
  store.record(event);
}

/** Run an observation; an observer never blocks on its own failure. */
async function observe($: ModsApi, what: string, work: () => Promise<void> | void): Promise<void> {
  try {
    await work();
  } catch (err) {
    $.ui.log(`run-observer: ${what} failed (${err instanceof Error ? err.message : String(err)})`);
  }
}

export function register(on: On): void {
  // The store is per-session; the host's $.state is the sharing surface
  // (the contract declares the 'store' key). In-memory by design (M13);
  // the file-backed collector is future work.
  const store = new TraceStore(DEFAULT_POLICY);
  let currentRunId = 'RUN-0001';
  let sessionId: string | undefined;

  on('session.start', async ($, _e: SessionStartEvent, next) => {
    await observe($, 'session-start', () => {
      sessionId = $.session.id();
      $.ui.log('run-observer: session started');
      record(store, currentRunId, $.clock.now(), 'session-start', `session=${sessionId ?? '?'}`);
    });
    return next(_e);
  });

  on('turn.start', async ($, e: TurnStartEvent, next) => {
    await observe($, 'turn-start', () => {
      if (e.turnId !== undefined) currentRunId = e.turnId;
      record(store, currentRunId, $.clock.now(), 'turn-start', `run=${currentRunId}`);
    });
    return next(e);
  });

  // turn.step streams: delegate with yield* and record what came back
  // (the model that answered and its token usage).
  on('turn.step', async function* ($, e: TurnStepEvent, next) {
    const result = yield* next(e);
    await observe($, 'turn-step', () => {
      const usage = (result as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      const model = (result as { model?: string }).model ?? e.model ?? undefined;
      record(store, currentRunId, $.clock.now(), 'turn-step', `model=${model ?? '?'}`, {
        ...(model !== undefined ? { model } : {}),
        ...(usage?.input_tokens !== undefined ? { tokensIn: usage.input_tokens } : {}),
        ...(usage?.output_tokens !== undefined ? { tokensOut: usage.output_tokens } : {}),
        partial: usage === undefined,
      });
    });
    return result;
  });

  on('tool.call', async ($, e: ToolCallEvent, next) => {
    const startedAt = $.clock.now();
    const result = await next(e);
    await observe($, 'tool-call', () => {
      const r = result as { deny?: unknown; isError?: unknown } | undefined;
      const ok = !(
        r !== null &&
        typeof r === 'object' &&
        (r.isError !== undefined || r.deny !== undefined)
      );
      const durationMs = $.clock.now() - startedAt;
      record(
        store,
        currentRunId,
        $.clock.now(),
        'tool-call',
        `tool=${e.tool} ok=${ok} ${durationMs}ms`,
      );
    });
    return result;
    // Fail open: an observer must never block the chain. observe() already
    // swallows this plugin's own recording errors; this .catch is the final
    // net so any residual throw still yields "no result" (the host proceeds
    // with the tool's own outcome) instead of aborting the call.
  }).catch(() => undefined);

  on('turn.complete', async ($, e: TurnCompleteEvent, next) => {
    await observe($, 'turn-complete', () => {
      const usage = e.usage;
      const parts = [`run=${e.turnId ?? currentRunId}`];
      if (e.agentId !== undefined) parts.push(`agent=${e.agentId}`);
      if (e.isAborted !== undefined && e.isAborted) parts.push('aborted');
      record(store, currentRunId, $.clock.now(), 'turn-complete', parts.join(' '), {
        ...(usage?.input_tokens !== undefined ? { tokensIn: usage.input_tokens } : {}),
        ...(usage?.output_tokens !== undefined ? { tokensOut: usage.output_tokens } : {}),
        partial: usage === undefined,
      });
      // Surface a live status line under the prompt.
      $.ui.status(
        `kit: ${store.getRun(currentRunId)?.events.length ?? 0} events · run=${currentRunId}`,
      );
    });
    // Expose the store via $.state so kit runs can read it.
    $.state.set({ plugin: 'run-observer', key: 'store' }, store);
    return next(e);
  });
}
