// plugins/sdlc-guard/contract.d.ts
//
// Type contract for the Claude Code host (referenced by plugin.json's
// "types" field). Declares the `$.state` values and the `$`/event surface
// this mod uses, as the ambient 'claude-code' module — the one bare import
// a hooks module is allowed. Self-contained by host rule (no imports); the
// shapes inline the kit contracts types.
//
// These declarations mirror the official Mods API (verified November
// 2026): tool.call carries the tool's arguments as fields of the event;
// tool.check carries them under e.input and answers { decision, reason? }.

declare module 'claude-code' {
  // ─── Events used by sdlc-guard ────────────────────────────────────────
  export interface ToolCallEvent {
    tool: string;
    command?: string;
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    [key: string]: unknown;
  }
  export interface ToolCheckEvent {
    tool: string;
    input: { command?: string; file_path?: string; [key: string]: unknown };
    isReadOnly?: boolean;
  }
  export interface ToolCheckResult {
    decision: 'allow' | 'ask' | 'deny';
    reason?: string;
  }

  // ─── Mods API surface used by sdlc-guard ──────────────────────────────
  export interface ModsApi {
    ui: {
      log: (message: string) => void;
      status: (text: string) => void;
      ask: (question: string, options: ReadonlyArray<string>) => Promise<string>;
    };
    state: {
      get: <T>(ref: { plugin: string; key: string }) => T | undefined;
      set: <T>(ref: { plugin: string; key: string }, value: T) => void;
    };
  }

  // ─── Registration ─────────────────────────────────────────────────────
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
    (
      event: 'tool.check',
      handler: (
        $: ModsApi,
        e: ToolCheckEvent,
        next: (e: ToolCheckEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'tool.check',
      matcher: Matcher,
      handler: (
        $: ModsApi,
        e: ToolCheckEvent,
        next: (e: ToolCheckEvent) => Promise<unknown> | unknown,
      ) => Promise<unknown> | unknown,
    ): Registration;
  }

  // The state keys this plugin reads or writes on $.state. The host (or
  // the installer) can override 'context' before the first event.
  interface PluginState {
    'sdlc-guard': {
      // PolicyContext: interactive defaults to true.
      context: { interactive: boolean; scopeFileCount?: number; isProduction?: boolean } | undefined;
    };
  }
}
