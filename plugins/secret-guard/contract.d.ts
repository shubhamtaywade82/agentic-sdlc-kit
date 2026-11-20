// plugins/secret-guard/contract.d.ts
//
// Type contract for the Claude Code host (referenced by plugin.json's
// "types" field). Declares the `$.state` values and the `$`/event surface
// this mod uses, as the ambient 'claude-code' module — the one bare import
// a hooks module is allowed. Self-contained by host rule (no imports).
//
// These declarations mirror the official Mods API (verified November
// 2026): tool.call carries the tool's arguments as fields of the event
// (e.command for Bash, e.file_path + e.content for Write, e.file_path +
// e.old_string + e.new_string for Edit); results observed after
// `await next(e)` carry deny / isError / text.

declare module 'claude-code' {
  // ─── Events used by secret-guard ─────────────────────────────────────
  export interface ToolCallEvent {
    tool: string;
    command?: string;
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    notebook_path?: string;
    new_source?: string;
    [key: string]: unknown;
  }
  export interface ToolCallResult {
    deny?: string;
    result?: unknown;
    isError?: boolean;
    text?: string;
    context?: string[];
    [key: string]: unknown;
  }

  // ─── Mods API surface used by secret-guard ───────────────────────────
  export interface ModsApi {
    ui: {
      log: (message: string) => void;
      status: (text: string) => void;
      ask: (question: string, options: ReadonlyArray<string>) => Promise<string>;
    };
    process: {
      run: (args: ReadonlyArray<string>) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
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
    'secret-guard': {
      // RedactionPolicy (contracts): defaults ship in the module; the host
      // or installer can override before the first event.
      policy:
        | {
            schemaVersion: 1;
            placeholderFormat: string;
            redactPartial: boolean;
            redactRepeated: boolean;
            maxInputChars: number;
            ignorePaths: string[];
          }
        | undefined;
    };
  }
}
