// plugins/run-observer/contract.d.ts
//
// Type contract for the Claude Code host (referenced by plugin.json's
// "types" field). Declares the `$.state` values and the `$`/event surface
// this mod uses, as the ambient 'claude-code' module — the one bare import
// a hooks module is allowed. Self-contained by host rule (no imports).
//
// These declarations mirror the official Mods API (verified November
// 2026): turn.start identifies the turn with e.turnId; turn.complete
// carries e.answer / e.durationMs / e.usage / e.isAborted / e.agentId;
// turn.step STREAMS (async generator delegating with yield*); tool.call
// carries the tool's arguments as fields of e; results observed after
// `await next(e)` carry deny / isError.

declare module 'claude-code' {
  // ─── Events used by run-observer ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the host event carries no known fields
export interface SessionStartEvent {
    // Fires once per loaded mod before the first prompt, and again on
    // reload. Use $.session.id() for the session identity.
  }
  export interface TurnStartEvent {
    turnId: string;
  }
  export interface TurnStepEvent {
    model?: string;
    effort?: string;
    agentId?: string;
    request?: unknown;
  }
  export interface TurnStepResult {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    model?: string;
    [key: string]: unknown;
  }
  export interface TurnCompleteEvent {
    turnId?: string;
    answer: string;
    durationMs: number;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    isAborted?: boolean;
    agentId?: string;
  }
  export interface ToolCallEvent {
    tool: string;
    command?: string;
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    [key: string]: unknown;
  }
  export interface ToolCallResult {
    deny?: string;
    result?: unknown;
    isError?: boolean;
    text?: string;
    [key: string]: unknown;
  }

  // ─── Mods API surface used by run-observer ───────────────────────────
  export interface ModsApi {
    ui: {
      log: (message: string) => void;
      status: (text: string) => void;
      ask: (question: string, options: ReadonlyArray<string>) => Promise<string>;
    };
    session: {
      id: () => string;
      cwd: () => string;
    };
    clock: {
      now: () => number;
    };
    state: {
      get: <T>(ref: { plugin: string; key: string }) => T | undefined;
      set: <T>(ref: { plugin: string; key: string }, value: T) => void;
    };
  }

  // ─── Registration ────────────────────────────────────────────────────
  export interface Matcher {
    tool?: string | ReadonlyArray<string> | RegExp;
    command?: string;
    isReadOnly?: boolean;
  }
  export interface Registration {
    catch: (handler: (error: unknown) => unknown) => void;
  }
  export interface On {
    (
      event: 'session.start',
      handler: (
        $: ModsApi,
        e: SessionStartEvent,
        next: (e: SessionStartEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'turn.start',
      handler: (
        $: ModsApi,
        e: TurnStartEvent,
        next: (e: TurnStartEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
    // turn.step streams: the hook is an async generator delegating with
    // `const result = yield* next(e)`.
    (
      event: 'turn.step',
      handler: (
        $: ModsApi,
        e: TurnStepEvent,
        next: (e: TurnStepEvent) => AsyncGenerator<unknown, unknown, unknown>,
      ) => AsyncGenerator<unknown, unknown, unknown>,
    ): Registration;
    (
      event: 'turn.complete',
      handler: (
        $: ModsApi,
        e: TurnCompleteEvent,
        next: (e: TurnCompleteEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'tool.call',
      handler: (
        $: ModsApi,
        e: ToolCallEvent,
        next: (e: ToolCallEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'tool.call',
      matcher: Matcher,
      handler: (
        $: ModsApi,
        e: ToolCallEvent,
        next: (e: ToolCallEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
  }

  // The state keys this plugin reads or writes on $.state.
  interface PluginState {
    'run-observer': {
      // The live TraceStore, exposed each turn so kit runs can read it.
      // Shape per plugins/run-observer/policies/trace-store.
      store: unknown;
    };
  }
}
