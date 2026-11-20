// plugins/model-router/contract.d.ts
//
// Type contract for the Claude Code host (referenced by plugin.json's
// "types" field). Declares the `$.state` values and the `$`/event surface
// this mod uses, as the ambient 'claude-code' module — the one bare import
// a hooks module is allowed. Self-contained by host rule (no imports).
//
// These declarations mirror the official Mods API (verified November
// 2026): turn.step STREAMS — its hook is an async generator delegating
// with `const result = yield* next(e)` and rewriting with
// `yield* next({ ...e, model })`; agent.spawn rewrites via
// `next({ ...e, model })` and must skip resumed runs (e.resume).

declare module 'claude-code' {
  // ─── Events used by model-router ─────────────────────────────────────
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
  export interface AgentSpawnEvent {
    name?: string;
    subagentType?: string;
    description?: string;
    model?: string;
    isTeammate?: boolean;
    // Set when a finished subagent is resumed; changes are IGNORED for
    // resumed runs — a router must skip them.
    resume?: boolean;
  }

  // ─── Mods API surface used by model-router ───────────────────────────
  export interface ModsApi {
    ui: {
      log: (message: string) => void;
      status: (text: string) => void;
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
  // next for turn.step is an async generator (the event streams): delegate
  // with `const result = yield* next(e)` or `yield* next({ ...e, model })`.
  export interface On {
    (
      event: 'turn.step',
      handler: (
        $: ModsApi,
        e: TurnStepEvent,
        next: (e: TurnStepEvent) => AsyncGenerator<unknown, unknown, unknown>,
      ) => AsyncGenerator<unknown, unknown, unknown>,
    ): Registration;
    (
      event: 'agent.spawn',
      handler: (
        $: ModsApi,
        e: AgentSpawnEvent,
        next: (e: AgentSpawnEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'agent.spawn',
      matcher: Matcher,
      handler: (
        $: ModsApi,
        e: AgentSpawnEvent,
        next: (e: AgentSpawnEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
  }

  // The state keys this plugin reads or writes on $.state.
  interface PluginState {
    'model-router': {
      // RoutingPolicy: the suggest-only default ships in the module; the
      // host or installer can override before the first event.
      policy:
        | {
            schemaVersion: 1;
            id: string;
            version: string;
            rules: unknown[];
            defaultModel: string;
            defaultEffort: 'low' | 'medium' | 'high';
            suggestOnly: boolean;
          }
        | undefined;
    };
  }
}
