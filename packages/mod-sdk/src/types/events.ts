// packages/mod-sdk/src/types/events.ts
//
// Typed event surface for Claude Code Mods, matching the official docs
// (code.claude.com/docs/en/plugins/mods — verified November 2026).
//
// These shapes describe what the REAL host passes to a Mod:
//   - tool.call: the tool's arguments are FIELDS of the event
//     (e.command for Bash, e.file_path + e.content for Write, ...).
//   - tool.check: the arguments are under e.input; the hook answers with
//     { decision: 'allow' | 'ask' | 'deny', reason? }.
//   - turn.step streams: the hook is an async generator delegating with
//     `const result = yield* next(e)`.
//   - turn.start identifies the turn with e.turnId; turn.complete carries
//     e.answer / e.durationMs / e.usage / e.isAborted / e.agentId.
//   - on(...) returns a registration whose .catch(handler) runs when the
//     hook throws or times out (fail-closed error handling).
//
// When deployed in a real Claude Code environment, the host's `on` is what
// actually dispatches events; the SDK's types are advisory. The installed
// Claude Code version's type declarations are the final authority (per
// RESEARCH.md §3 caveat). See ADR-0014.

// ─── Tool events ───────────────────────────────────────────────────────────
export interface ToolCallEvent {
  tool: string;
  // Tool arguments are fields of the event itself. Common built-ins:
  command?: string; // Bash
  file_path?: string; // Edit / Write
  content?: string; // Write
  old_string?: string; // Edit
  new_string?: string; // Edit
  notebook_path?: string; // NotebookEdit
  new_source?: string; // NotebookEdit
  // Other tools' arguments appear as their own fields.
  [key: string]: unknown;
}
export interface ToolCallResult {
  // Returning { deny } cancels the call (pre-execution) or withholds the
  // result (post-execution — the call already ran).
  deny?: string;
  // Returning { result } supplies a result without running the tool.
  result?: unknown;
  // Set on a failed result observed after `await next(e)`.
  isError?: boolean;
  // The text the model reads (tool results); redactable in place.
  text?: string;
  context?: string[];
  [key: string]: unknown;
}
export interface ToolCheckEvent {
  tool: string;
  // For tool.check the tool's arguments live under e.input.
  input: { command?: string; file_path?: string; [key: string]: unknown };
  // True when the tool reports the call as read-only (absent otherwise).
  isReadOnly?: boolean;
}
export interface ToolCheckResult {
  decision: 'allow' | 'ask' | 'deny';
  reason?: string;
}

// ─── Turn events ───────────────────────────────────────────────────────────
export interface TurnUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
export interface TurnStepEvent {
  // The current model and effort; the Mod can rewrite these.
  model?: string;
  effort?: string;
  // Set for a subagent's request.
  agentId?: string;
  // The prompt/request being sent to the model.
  request?: unknown;
}
export interface TurnStepResult {
  usage?: TurnUsage;
  model?: string;
  [key: string]: unknown;
}
export interface TurnStartEvent {
  // Identifies the turn in the other turn events.
  turnId: string;
}
export interface TurnCompleteEvent {
  turnId?: string;
  // Claude's final text.
  answer: string;
  durationMs: number;
  usage?: TurnUsage;
  isAborted?: boolean;
  // Set for a subagent's turn.
  agentId?: string;
}

// ─── Agent events ──────────────────────────────────────────────────────────
export interface AgentSpawnEvent {
  name?: string;
  subagentType?: string;
  description?: string;
  model?: string;
  // True for an agent-team teammate.
  isTeammate?: boolean;
  // Set when a finished subagent is resumed; changes are IGNORED for
  // resumed runs — a router must skip them.
  resume?: boolean;
}

// ─── Session / command events ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the host event carries no known fields
export interface SessionStartEvent {
  // Fires once per loaded mod before the first prompt, and again on
  // reload. Use $.session.id() for the session identity.
}
export interface SessionEndEvent {
  reason?: 'clear' | 'resume' | 'logout' | 'prompt_input_exit' | 'other';
}
export interface CommandRunEvent {
  command: string;
  // The text typed after the command name (or '').
  args?: string;
}

// ─── Event name → event type map ───────────────────────────────────────────
export interface EventMap {
  'tool.call': ToolCallEvent;
  'tool.check': ToolCheckEvent;
  'turn.start': TurnStartEvent;
  'turn.step': TurnStepEvent;
  'turn.complete': TurnCompleteEvent;
  'agent.spawn': AgentSpawnEvent;
  'session.start': SessionStartEvent;
  'session.end': SessionEndEvent;
  'command.run': CommandRunEvent;
}

export type EventName = keyof EventMap;
export type EventOf<N extends EventName> = EventMap[N];

// ─── Mods API ──────────────────────────────────────────────────────────────
// The `$` argument passed to every handler: the mods API methods grouped in
// namespaces (official surface, subset used by this kit's mods).
export interface StateRef {
  plugin: string;
  key: string;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ModsApi {
  ui: {
    // Dim transcript line the model does NOT read.
    log: (message: string) => void;
    // Status line under the prompt.
    status: (text: string) => void;
    // Modal question; resolves to the chosen label string. Rejects when
    // dismissed or nobody can answer (catch → treat as refuse). Time in
    // ask does not count against the hook time budget.
    ask: (question: string, options: ReadonlyArray<string>) => Promise<string>;
  };
  fs: {
    // Paths resolve against the session working directory.
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
    list: (path: string) => Promise<string[]>;
  };
  // Argument array, NO shell.
  process: {
    run: (args: ReadonlyArray<string>) => Promise<ProcessResult>;
  };
  command: {
    register: (cmd: {
      name: string;
      description: string;
      argumentHint?: string;
    }) => Promise<void>;
  };
  session: {
    id: () => string;
    cwd: () => string;
  };
  clock: {
    now: () => number;
  };
  // State references use { plugin, key } literals so the host can list the
  // values a module reads and writes.
  state: {
    get: <T>(ref: StateRef) => T | undefined;
    set: <T>(ref: StateRef, value: T) => void;
  };
  // The host's HTTP fetch, gated by the `networkAccess` capability.
  http: {
    fetch: (url: string, init?: unknown) => Promise<unknown>;
  };
}

// ─── Handler shape ─────────────────────────────────────────────────────────
// A handler receives ($, e, next). It MUST return either:
//   - a result object WITHOUT calling next — this answers the event,
//   - the return value of next(e) or next(modifiedEvent) — observe/rewrite,
//   - a Promise of either.
export type Handler<N extends EventName> = (
  $: ModsApi,
  e: EventOf<N>,
  next: (e: EventOf<N>) => Promise<unknown> | unknown,
) => Promise<unknown> | unknown;

// Streaming events (turn.step) take the generator form instead: the hook
// is an async generator that delegates with `yield* next(e)` (forwarding
// the response chunks) and returns the finished result.
export type StreamHandler<N extends EventName> = (
  $: ModsApi,
  e: EventOf<N>,
  next: (e: EventOf<N>) => AsyncGenerator<unknown, unknown, unknown>,
) => AsyncGenerator<unknown, unknown, unknown>;

// ─── Matchers and the `on` function ────────────────────────────────────────
// A matcher is an object whose fields are compared with the event's; each
// field can be a value, an array of allowed values, or a RegExp.
export interface Matcher {
  tool?: string | ReadonlyArray<string> | RegExp;
  command?: string;
  isReadOnly?: boolean;
  plugin?: string;
}

// on(...) returns a registration whose .catch(handler) sets the hook's
// error handler: it runs when the hook throws or times out, and its
// return value replaces the hook's contribution (fail-closed gating).
export interface Registration {
  catch: (handler: (error: unknown) => unknown) => void;
}

export interface On {
  <N extends EventName>(event: N, handler: Handler<N> | StreamHandler<N>): Registration;
  <N extends EventName>(
    event: N,
    matcher: Matcher,
    handler: Handler<N> | StreamHandler<N>,
  ): Registration;
}

// The register function every Mod exports. The host calls it once on load
// with `on` and the userConfig `options`.
export interface RegisterFn {
  (on: On, options?: Record<string, unknown>): void;
}
