// plugins/run-observer/hooks/register.ts
//
// run-observer: execution telemetry. Records session/turn/tool events into
// a bounded in-memory TraceStore (per M13) and exposes it via $.state.
//
// Host contract (official engine declarations, verified against
// @anthropic-ai/claude-code 2.1.329 — see
// .claude-plugin/types/claude-code/index.d.ts): turn.start carries
// e.turnId; turn.complete carries e.answer / e.durationMs / e.usage /
// e.isAborted / e.agentId; turn.step streams (async generator, `const
// result = yield* next(e)`) and its result carries the answering model
// under result.usage.model; tool.call carries the tool's arguments as
// fields of e; timestamps come from `await $.clock.now()` (the official
// clock is async — the mock/old code froze `at` at the epoch — 1970-01-01
// — which is exactly the fabricated-data bug this kit refuses to ship).
//
// An observer MUST NEVER BLOCK the chain: every handler body is wrapped
// in try/catch that swallows errors silently (e21a473: telemetry must never
// spam or disrupt the user), and next(e) always runs. No .catch is needed
// on the observe-only handlers; the one tool.call observer carries a
// residual .catch net.
//
// NOTE on the atom() line in register(): an offline
// `claude plugin validate` run types the atom ref against an EMPTY
// PluginState (its checker does not merge this plugin's contract) and so
// flags that line the same way it flags Claude Code's own turn-band
// example mod — the real engine lays the merged declarations at
// .claude-plugin/types/claude-code/index.d.ts and the same line
// typechecks cleanly there.
//
// Static-analysis rules honored here: full $.x.y(...) calls;
// string-literal event names; `$` is never assigned or destructured, and
// is passed only to observe, a top-level function of this same file (the
// record helper takes plain values, not $).

import type {
  EngineInterface,
  On,
  SessionStartInput,
  ToolCallInput,
  ToolCallResult,
  TurnCompleteInput,
  TurnStartInput,
  TurnStepInput,
  TurnStepResult,
} from 'claude-code';
import { atom, update } from 'claude-code';
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
async function observe(
  // Underscore-prefixed: e21a473 removed the only use of `$` (the catch now
  // fails silently), so the parameter must not trip noUnusedParameters.
  _$: EngineInterface,
  _what: string,
  work: () => Promise<void> | void,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    // Fail silently: telemetry observations must never spam or disrupt user interaction.
    void err;
  }
}

/** The host clock, or undefined when it fails: an observer's clock is best-effort. */
async function readClock($: EngineInterface): Promise<number | undefined> {
  try {
    return await $.clock.now();
  } catch {
    return undefined;
  }
}

export function register(on: On): void {
  // The store is per-session; the host's $.state is the sharing surface
  // (the contract declares the 'store' key). In-memory by design (M13);
  // the file-backed collector is future work.
  const store = new TraceStore(DEFAULT_POLICY);
  // The store state key, declared in contract.d.ts. update() publishes
  // the live store each turn so kit runs can read it.
  const STORE = atom({ plugin: 'run-observer', key: 'store' } as const, store);
  let currentRunId = 'RUN-0001';
  let sessionId: string | undefined;

  on('session.start', async ($, _e: SessionStartInput, next) => {
    await observe($, 'session-start', async () => {
      sessionId = await $.session.id();
      record(
        store,
        currentRunId,
        await $.clock.now(),
        'session-start',
        `session=${sessionId ?? '?'}`,
      );
    });
    return next(_e);
  });

  on('turn.start', async ($, e: TurnStartInput, next) => {
    await observe($, 'turn-start', async () => {
      if (e.turnId !== undefined) currentRunId = e.turnId;
      record(store, currentRunId, await $.clock.now(), 'turn-start', `run=${currentRunId}`);
    });
    return next(e);
  });

  // turn.step streams: delegate with yield* and record what came back
  // (the model that answered — under result.usage.model — and its token
  // usage).
  on('turn.step', async function* ($, e: TurnStepInput, next) {
    const result: TurnStepResult = yield* next(e);
    await observe($, 'turn-step', async () => {
      const usage = result.usage;
      const model = usage?.model ?? undefined;
      record(store, currentRunId, await $.clock.now(), 'turn-step', `model=${model ?? '?'}`, {
        ...(model !== undefined ? { model } : {}),
        ...(usage?.input_tokens !== undefined ? { tokensIn: usage.input_tokens } : {}),
        ...(usage?.output_tokens !== undefined ? { tokensOut: usage.output_tokens } : {}),
        partial: usage == null,
      });
    });
    return result;
  });

  on('tool.call', async ($, e: ToolCallInput, next) => {
    // Telemetry must never decide whether the chain runs. This registration
    // fails open (.catch below yields "no result"), so a throw BEFORE next()
    // would swallow every guard registered inside this observer (approval,
    // secret scan). Read the clock defensively and always reach next().
    const startedAt = await readClock($);
    const result = await next(e);
    await observe($, 'tool-call', async () => {
      // Tolerate a host that resolves to nothing (the official engine
      // always yields a ToolCallResult; the kit's MockRuntime may be
      // configured without one) before touching fields.
      const r = result as ToolCallResult<string> | undefined | null;
      const ok = !(
        r !== null &&
        typeof r === 'object' &&
        (r.isError !== undefined || r.deny !== undefined)
      );
      const durationMs = startedAt === undefined ? 0 : (await $.clock.now()) - startedAt;
      record(
        store,
        currentRunId,
        await $.clock.now(),
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

  on('turn.complete', async ($, e: TurnCompleteInput, next) => {
    await observe($, 'turn-complete', async () => {
      const usage = e.usage;
      const parts = [`run=${e.turnId ?? currentRunId}`];
      if (e.agentId !== undefined) parts.push(`agent=${e.agentId}`);
      if (e.isAborted) parts.push('aborted');
      record(store, currentRunId, await $.clock.now(), 'turn-complete', parts.join(' '), {
        ...(usage?.input_tokens !== undefined ? { tokensIn: usage.input_tokens } : {}),
        ...(usage?.output_tokens !== undefined ? { tokensOut: usage.output_tokens } : {}),
        partial: usage == null,
      });
      // Surface a live status line under the prompt.
      $.ui.status(
        `kit: ${store.getRun(currentRunId)?.events.length ?? 0} events · run=${currentRunId}`,
      );
      // Publishing is telemetry too: a state backend failure must not prevent
      // the lifecycle event from reaching downstream handlers.
      await update($, STORE, () => store);
    });
    return next(e);
  });
}
