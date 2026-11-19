/**
 * run-observer — Claude Code mod entry point.
 *
 * Execution telemetry (P1, deliberately lean). Observe-only: every hook is a
 * pass-through. A broken observer must be INVISIBLE — all observe work is
 * wrapped in try/catch that swallows and $.ui.log's once; there are
 * intentionally NO .catch chains (nothing here may deny or block an action).
 *
 * Events: session.start (registers the /kit:status command), tool.call,
 * turn.start, turn.step (async generator, observe), turn.complete,
 * agent.spawn (observe), command.run {command:'kit:status'}.
 *
 * In-memory state is module-level and reset at each session.start (the event
 * also fires on session reload). Records are best-effort persisted as JSONL
 * via read-modify-write to .ai/reports/runs/<sessionId>.jsonl — see the
 * caveat on flush().
 *
 * `observer.enabled: false` in .ai/project.yml: register() itself is
 * synchronous and the profile is read asynchronously, so the hooks are
 * registered unconditionally but every one of them becomes a no-op
 * pass-through once session.start has read the profile (session.start fires
 * before the first prompt, so nothing is ever observed), and /kit:status is
 * never registered.
 */

import {
  agentSpawn,
  sessionStart,
  summarize,
  toLine,
  toolCall,
  turnComplete,
  turnStart,
  turnStep,
} from '../policies/events.ts';
import type { RunRecord } from '../policies/events.ts';
import { defaultObserverConfig, parseObserverProfile } from '../policies/profile.ts';

/** Current-session records (reset at every session.start). */
let records: RunRecord[] = [];
/** How many records have already been written to the JSONL file. */
let persisted = 0;
let sessionId = 'session';
/** Default true (documented default); confirmed at session.start. */
let active = true;
/** Only complain once — a broken observer must not spam the transcript. */
let warned = false;

function warnOnce($: ModApi, err: unknown): void {
  if (warned) return;
  warned = true;
  try {
    $.ui.log('run-observer: internal error — staying silent for the rest of the session (' + String(err) + ')');
  } catch {
    /* nothing more we can do */
  }
}

function safeSessionId($: ModApi): string {
  try {
    const id = $.session.id();
    return typeof id === 'string' && id !== '' ? id : 'session';
  } catch {
    return 'session';
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

/** Token-count field names seen across API shapes (snake_case et al.). */
const TOKEN_IN_KEYS = ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens'];
const TOKEN_OUT_KEYS = ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens'];

function tokenCount(usage: { [key: string]: unknown } | undefined, keys: string[]): number | undefined {
  if (usage === undefined) return undefined;
  for (const k of keys) {
    const v = num(usage[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

async function isEnabled($: ModApi): Promise<boolean> {
  try {
    if (await $.fs.exists('.ai/project.yml')) {
      return parseObserverProfile(await $.fs.read('.ai/project.yml')).enabled;
    }
  } catch {
    // unreadable/invalid profile → documented default (enabled)
  }
  return defaultObserverConfig().enabled;
}

/**
 * Best-effort persistence: read-modify-write of the session JSONL file.
 *
 * CAVEAT: this is NOT atomic — two concurrent sessions writing the same file
 * (or a crash mid-write) can lose lines. Accepted for v1 telemetry; the data
 * is diagnostic, not authoritative. Failures are swallowed.
 */
async function flush($: ModApi): Promise<void> {
  try {
    if (records.length === persisted) return;
    const path = '.ai/reports/runs/' + sessionId + '.jsonl';
    let prev = '';
    try {
      prev = await $.fs.read(path);
    } catch {
      prev = '';
    }
    const delta = records
      .slice(persisted)
      .map(toLine)
      .filter((l) => l !== '')
      .join('\n');
    persisted = records.length;
    if (delta === '') return;
    const base = prev === '' ? '' : prev.endsWith('\n') ? prev : prev + '\n';
    await $.fs.write(path, base + delta + '\n');
  } catch (err) {
    warnOnce($, err);
  }
}

function countByKind(kind: string): number {
  let n = 0;
  for (const r of records) {
    if (r.kind === kind) n++;
  }
  return n;
}

function statusLine(): string {
  return 'kit: ' + countByKind('tool-call') + ' tools · ' + countByKind('turn-start') + ' turns';
}

export function register(on: OnFn, options: RegisterOptions): void {
  void options;

  // -----------------------------------------------------------------------
  // session.start — also fires on reload: re-read the profile, reset state
  // -----------------------------------------------------------------------
  on('session.start', async ($, e, next) => {
    try {
      active = await isEnabled($);
      records = [];
      persisted = 0;
      if (active) {
        sessionId = safeSessionId($);
        records.push(sessionStart($.clock.now(), sessionId));
        try {
          await $.command.register({
            name: 'kit:status',
            description: 'Agentic SDLC Kit: run summary for this session (tools, turns, tokens, agents)',
          });
        } catch (err) {
          warnOnce($, err); // older Claude Code without command registration
        }
        $.ui.status(statusLine());
        await flush($);
      }
    } catch (err) {
      warnOnce($, err);
    }
    return next(e);
  });

  // -----------------------------------------------------------------------
  // tool.call — observe only: duration + outcome (never blocks)
  // -----------------------------------------------------------------------
  on('tool.call', async ($, e, next) => {
    if (!active) return next(e);
    let t0 = 0;
    try {
      t0 = $.clock.now();
    } catch (err) {
      warnOnce($, err);
    }
    const result = await next(e);
    try {
      const tool = typeof e.tool === 'string' ? e.tool : 'unknown';
      const ok = !(result && (result.isError || result.deny));
      records.push(toolCall($.clock.now(), tool, ok, $.clock.now() - t0));
    } catch (err) {
      warnOnce($, err);
    }
    return result;
  });

  // -----------------------------------------------------------------------
  // turn.start
  // -----------------------------------------------------------------------
  on('turn.start', async ($, e, next) => {
    if (!active) return next(e);
    try {
      const turnId = typeof e.turnId === 'string' ? e.turnId : String(e.turnId ?? '');
      records.push(turnStart($.clock.now(), turnId));
      await flush($);
    } catch (err) {
      warnOnce($, err);
    }
    return next(e);
  });

  // -----------------------------------------------------------------------
  // turn.step — async generator: record the model + usage that answered
  // -----------------------------------------------------------------------
  on('turn.step', async function* ($, e, next) {
    if (!active) {
      const skipped = yield* next(e);
      return skipped;
    }
    const result = yield* next(e);
    try {
      const model = result && typeof result.model === 'string' ? result.model : '';
      const agentId = typeof e.agentId === 'string' ? e.agentId : '';
      const usage =
        result && result.usage && typeof result.usage === 'object'
          ? (result.usage as { [key: string]: unknown })
          : undefined;
      records.push(
        turnStep(
          $.clock.now(),
          model,
          agentId,
          tokenCount(usage, TOKEN_IN_KEYS),
          tokenCount(usage, TOKEN_OUT_KEYS),
        ),
      );
    } catch (err) {
      warnOnce($, err);
    }
    return result;
  });

  // -----------------------------------------------------------------------
  // turn.complete — cheap status line update + coarse flush
  // -----------------------------------------------------------------------
  on('turn.complete', async ($, e, next) => {
    if (!active) return next(e);
    try {
      const usage =
        e.usage && typeof e.usage === 'object' ? (e.usage as { [key: string]: unknown }) : undefined;
      records.push(
        turnComplete(
          $.clock.now(),
          num(e.durationMs),
          tokenCount(usage, TOKEN_IN_KEYS),
          tokenCount(usage, TOKEN_OUT_KEYS),
          e.isAborted === true,
          typeof e.agentId === 'string' ? e.agentId : undefined,
        ),
      );
      try {
        $.ui.status(statusLine());
      } catch {
        /* status line is cosmetic */
      }
      await flush($);
    } catch (err) {
      warnOnce($, err);
    }
    return next(e);
  });

  // -----------------------------------------------------------------------
  // agent.spawn — observe spawned agents/teammates and their models
  // -----------------------------------------------------------------------
  on('agent.spawn', async ($, e, next) => {
    if (!active) return next(e);
    const result = await next(e);
    try {
      const name = typeof e.name === 'string' ? e.name : 'unnamed';
      const model = typeof e.model === 'string' ? e.model : '';
      records.push(agentSpawn($.clock.now(), name, model, e.isTeammate === true));
      await flush($);
    } catch (err) {
      warnOnce($, err);
    }
    return result;
  });

  // -----------------------------------------------------------------------
  // /kit:status — text summary printed in the transcript (Claude reads it)
  // -----------------------------------------------------------------------
  on('command.run', { command: 'kit:status' }, async ($, e) => {
    void e;
    try {
      return { text: summarize(records) };
    } catch (err) {
      warnOnce($, err);
    }
    return {};
  });
}
