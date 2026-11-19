// packages/mod-sdk/src/types/events.ts
//
// Typed event surface for Claude Code Mods, matching RESEARCH.md §3.
//
// The SDK declares its own minimal event type surface. When deployed in a
// real Claude Code environment, the host's `on` is what actually dispatches
// events; the SDK's types are advisory. The installed Claude Code version's
// type declarations are the final authority (per RESEARCH.md §3 caveat).
//
// See ADR-0014.

// ─── Tool events ───────────────────────────────────────────────────────────
export interface ToolCallEvent {
  tool: string;
  // For Bash: the command string. For Edit/Write: the path. etc.
  // Typed loosely because the shape varies per tool; Mods cast as needed.
  input: unknown;
  // Present when intercepting the result (post-execution).
  output?: unknown;
}
export interface ToolCallResult {
  // Returning { deny } cancels the call (pre-execution) or withholds the
  // result (post-execution — the call already ran; the result is just not
  // shown to the model).
  deny?: string;
  // Returning { result } supplies a result without running the tool.
  result?: unknown;
}
export interface ToolCheckEvent {
  tool: string;
  input: unknown;
}
export type ToolCheckResult = 'allow' | 'ask' | 'deny';
export interface ToolDescribeEvent {
  tool: string;
  description: string;
}

// ─── Turn events ───────────────────────────────────────────────────────────
export interface TurnStepEvent {
  // The current model and effort; the Mod can rewrite these.
  model?: string;
  effort?: string;
  // The prompt/request being sent to the model.
  request?: unknown;
}
export interface TurnStartEvent {
  runId?: string;
}
export interface TurnCompleteEvent {
  runId?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
}

// ─── Agent events ──────────────────────────────────────────────────────────
export interface AgentSpawnEvent {
  name?: string;
  subagentType?: string;
  description?: string;
  model?: string;
  // True when a subagent resumes (not a fresh spawn).
  resume?: boolean;
}
export interface AgentOfferEvent {
  type?: string;
}

// ─── Prompt events ─────────────────────────────────────────────────────────
export interface PromptSubmitEvent {
  prompt: string;
  context?: string[];
}
export interface PromptContextEvent {
  context: string[];
}

// ─── Session events ────────────────────────────────────────────────────────
export interface SessionStartEvent {
  sessionId?: string;
}
export interface SessionEndEvent {
  sessionId?: string;
}
export interface SessionAppendEvent {
  row?: unknown;
}

// ─── Filesystem / process / http API events ────────────────────────────────
export interface FsWriteEvent {
  path: string;
  content?: string;
}
export interface FsReadEvent {
  path: string;
}
export interface HttpFetchEvent {
  url: string;
}
export interface ProcessRunEvent {
  command: string[];
  cwd?: string;
}

// ─── Event name → event type map ───────────────────────────────────────────
export interface EventMap {
  'tool.call': ToolCallEvent;
  'tool.check': ToolCheckEvent;
  'tool.describe': ToolDescribeEvent;
  'turn.start': TurnStartEvent;
  'turn.step': TurnStepEvent;
  'turn.complete': TurnCompleteEvent;
  'agent.offer': AgentOfferEvent;
  'agent.spawn': AgentSpawnEvent;
  'prompt.submit': PromptSubmitEvent;
  'prompt.context': PromptContextEvent;
  'session.start': SessionStartEvent;
  'session.end': SessionEndEvent;
  'session.append': SessionAppendEvent;
  'fs.read': FsReadEvent;
  'fs.write': FsWriteEvent;
  'http.fetch': HttpFetchEvent;
  'process.run': ProcessRunEvent;
}

export type EventName = keyof EventMap;
export type EventOf<N extends EventName> = EventMap[N];

// ─── Mods API ──────────────────────────────────────────────────────────────
// Minimal surface of the `$` argument passed to every handler. Mods use
// this instead of reaching into the host directly, so the SDK can mock it
// in tests and the capability analyzer can audit which API surfaces a Mod
// uses.
export interface ModsApi {
  ui: {
    log: (message: string) => void;
    open: (pane: unknown) => void;
    resolve: (id: string, definition: unknown) => void;
  };
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
  };
  state: {
    get: <T>(key: string) => T | undefined;
    set: <T>(key: string, value: T) => void;
  };
  // The host's HTTP fetch, gated by the `networkAccess` capability.
  http: {
    fetch: (url: string, init?: unknown) => Promise<unknown>;
  };
}

// ─── Handler shape ─────────────────────────────────────────────────────────
// A handler receives ($, e, next). It MUST return either:
//   - a result object (ToolCallResult, ToolCheckResult, etc.) WITHOUT
//     calling next — this answers the event without forwarding,
//   - the return value of next(e) or next(modifiedEvent) — observe/rewrite,
//   - a Promise of either.
export type Handler<N extends EventName> = (
  $: ModsApi,
  e: EventOf<N>,
  next: (e: EventOf<N>) => Promise<unknown> | unknown,
) => Promise<unknown> | unknown;

// ─── The `on` function ─────────────────────────────────────────────────────
// Mods call `on(event, handler)` or `on(event, matcher, handler)`.
// The matcher is a partial filter (e.g., { tool: 'Bash' }) that the host
// applies before invoking the handler.
export interface Matcher {
  tool?: string;
}
export interface On {
  <N extends EventName>(event: N, handler: Handler<N>): void;
  <N extends EventName>(event: N, matcher: Matcher, handler: Handler<N>): void;
}

// The register function every Mod exports.
export interface RegisterFn {
  (on: On): void;
}
