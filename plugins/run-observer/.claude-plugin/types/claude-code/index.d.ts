// plugins/run-observer/.claude-plugin/types/claude-code/index.d.ts
//
// Vendored subset of the OFFICIAL Claude Code engine declarations for the
// ambient 'claude-code' module — the same declarations the engine lays at
// this exact path each time it loads the plugin from a folder its owner
// controls (overwriting this copy with the full, live version).
//
// Verified against @anthropic-ai/claude-code 2.1.329 by probing
// `claude plugin validate`, whose TypeScript checker runs against the
// engine's own declarations (each probe's diagnostic quotes the official
// signature):
//   - `$` is EngineInterface; event inputs are named *Input
//     (ToolCallInput, SessionStartInput, ...), never *Event;
//   - a literal matcher ({ tool: 'Bash' }) narrows e to that tool's
//     variant; an array matcher narrows to the union. tool.call variants
//     are readonly per-tool shapes discriminated by e.tool, so a handler
//     reads variant fields after an e.tool check;
//   - tool.check carries the tool's arguments under e.input (untyped);
//   - $.clock.now / $.session.id / $.session.cwd / $.state.get are ASYNC;
//     state reads resolve to StateRead<T>, whose .value unwraps the value;
//   - a tool.call handler returns ToolCallResult<string> | Promise<...>;
//     a tool.check handler answers { decision, reason }; turn.step
//     streams via `yield* next(e)` and its result carries the answering
//     model under result.usage.model.
//
// The official engine generates ~100 tool.call variants from the live
// tool schemas; this vendored subset covers the tools this kit's mods
// hook (Bash / Edit / Write / NotebookEdit) and is shared verbatim by the
// kit's four plugins. The plugin's own state keys merge in via
// contract.d.ts (interface PluginState), per the official types-contract
// grammar.

declare module 'claude-code' {
  // ─── State ─────────────────────────────────────────────────────────
  export interface StateRead<T> {
    // The stored value, or undefined when nothing was set.
    value: T | undefined;
  }
  export interface StateRef {
    // The host requires inline string literals ({ plugin: 'p', key: 'k' })
    // so it can list the values a module reads and writes.
    plugin: string;
    key: string;
  }
  // Base for the merged per-plugin state declared in contract.d.ts.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the official engine's base state; the plugin's keys merge in via contract.d.ts
  export interface PluginState {}

  // ─── The mods API ($): engine surface this kit uses ────────────────
  export interface EngineInterface {
    ui: {
      // Dim transcript line the model does NOT read.
      log: (text: string) => void;
      // Status line under the prompt.
      status: (text: string) => void;
      // Modal question; resolves to the chosen label. Rejects when
      // dismissed or nobody can answer (catch → treat as refuse).
      ask: (question: string, options: ReadonlyArray<string>) => Promise<string>;
    };
    // Argument array, NO shell.
    process: {
      run: (
        args: ReadonlyArray<string>,
      ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    };
    session: {
      id: () => Promise<string>;
      cwd: () => Promise<string>;
    };
    clock: {
      now: () => Promise<number>;
    };
    state: {
      // Reads resolve to StateRead<T> (unwrap with .value). The official
      // engine additionally types the ref against the merged PluginState;
      // this vendored copy keeps the ref permissive so hooks typecheck
      // standalone.
      get: <T>(ref: StateRef) => Promise<StateRead<T>>;
      set: <T>(ref: StateRef, value: T) => Promise<void>;
    };
  }

  // ─── Shared event shapes (official field sets) ──────────────────────
  export interface RequestMeta {
    readonly [key: string]: string;
  }
  // The usage of a finished turn; `model` is the model that answered.
  export interface TurnUsage {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_read_input_tokens: number;
    readonly cache_creation_input_tokens: number;
    readonly ephemeral_5m_input_tokens?: number | undefined;
    readonly ephemeral_1h_input_tokens?: number | undefined;
    readonly model: string;
  }

  // ─── Event inputs ────────────────────────────────────────────────────
  // tool.call variants (readonly, discriminated by e.tool):
  interface BashVariant {
    readonly tool: 'Bash';
    readonly tool_use_id: string;
    readonly command: string;
    readonly agentId?: string | undefined;
    readonly requestMeta?: RequestMeta | undefined;
  }
  interface EditVariant {
    readonly tool: 'Edit';
    readonly tool_use_id: string;
    readonly file_path: string;
    readonly old_string: string;
    readonly new_string: string;
    readonly replace_all?: boolean | undefined;
    readonly agentId?: string | undefined;
    readonly requestMeta?: RequestMeta | undefined;
  }
  interface WriteVariant {
    readonly tool: 'Write';
    readonly tool_use_id: string;
    readonly file_path: string;
    readonly content: string;
    readonly agentId?: string | undefined;
    readonly requestMeta?: RequestMeta | undefined;
  }
  interface NotebookEditVariant {
    readonly tool: 'NotebookEdit';
    readonly tool_use_id: string;
    readonly notebook_path: string;
    readonly cell_id?: string | undefined;
    readonly new_source: string;
    readonly cell_type?: 'code' | 'markdown' | undefined;
    readonly edit_mode?: 'delete' | 'insert' | 'replace' | undefined;
    readonly agentId?: string | undefined;
    readonly requestMeta?: RequestMeta | undefined;
  }
  export type ToolCallInput = BashVariant | EditVariant | WriteVariant | NotebookEditVariant;

  export interface ToolCallResult<T = string> {
    // Returning { deny } cancels the call (pre-execution) or withholds
    // the result (post-execution — the call already ran).
    deny?: T;
    // The text the model reads (tool results); redactable in place.
    text?: T;
    // Set on a failed result observed after `await next(e)`.
    isError?: boolean;
    // Returning { result } supplies a result without running the tool.
    result?: unknown;
    context?: ReadonlyArray<string>;
  }

  // tool.check: the tool's arguments live under e.input (untyped on the
  // official engine); the hook answers with { decision, reason? }.
  export interface ToolCheckInput {
    readonly tool: string;
    readonly input: unknown;
    readonly isReadOnly?: boolean | undefined;
  }
  export interface ToolCheckResult {
    decision: 'allow' | 'ask' | 'deny';
    reason?: string;
  }

  // Fires once per loaded mod before the first prompt, and again on
  // reload. Use `await $.session.id()` for the session identity.
  export interface SessionStartInput {
    readonly cwd: string;
    // RenderSurface | null on the official engine; opaque here.
    readonly surface: unknown;
    readonly isInteractive: boolean;
  }

  export interface TurnStartInput {
    readonly turnId: string;
  }

  // The current model and effort; the Mod can rewrite these (pass a
  // changed copy to next). `effort` is a level name or a number.
  export interface TurnStepInput {
    readonly model: string;
    readonly effort?: number | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
    readonly agentId?: string | undefined;
    readonly request?: unknown;
  }
  // What `yield* next(e)` returns for turn.step: the answering turn's
  // usage (carries the model), or null when none was recorded.
  export interface TurnStepResult {
    readonly usage: TurnUsage | null;
  }

  export interface TurnCompleteInput {
    readonly turnId: string;
    readonly answer: string;
    readonly durationMs: number;
    readonly usage?: TurnUsage | undefined;
    readonly isAborted: boolean;
    readonly agentId?: string | undefined;
  }

  export interface AgentSpawnInput {
    readonly name?: string | undefined;
    readonly subagentType?: string | undefined;
    readonly description?: string | undefined;
    readonly model?: string | undefined;
    // True for an agent-team teammate.
    readonly isTeammate?: boolean | undefined;
    // Set when a finished subagent is resumed; changes are IGNORED for
    // resumed runs — a router must skip them.
    readonly resume?: { readonly agentId: string } | undefined;
  }

  // ─── Registration ────────────────────────────────────────────────────
  export interface Matcher {
    tool?: string | ReadonlyArray<string> | RegExp;
    command?: string;
    isReadOnly?: boolean;
    plugin?: string;
  }
  export interface Registration {
    // Sets the hook's error handler: it runs when the hook throws or
    // times out, and its return value replaces the hook's contribution
    // (a guard fails closed here; an observer/router fails open).
    catch(handler: (error: unknown) => unknown): void;
  }

  export interface On {
    (
      event: 'tool.call',
      handler: (
        $: EngineInterface,
        e: ToolCallInput,
        next: (e: ToolCallInput) => Promise<ToolCallResult<string>>,
      ) => ToolCallResult<string> | Promise<ToolCallResult<string>>,
    ): Registration;
    (
      event: 'tool.call',
      matcher: { tool: 'Bash' },
      handler: (
        $: EngineInterface,
        e: BashVariant,
        next: (e: ToolCallInput) => Promise<ToolCallResult<string>>,
      ) => ToolCallResult<string> | Promise<ToolCallResult<string>>,
    ): Registration;
    (
      event: 'tool.call',
      matcher: { tool: 'Edit' },
      handler: (
        $: EngineInterface,
        e: EditVariant,
        next: (e: ToolCallInput) => Promise<ToolCallResult<string>>,
      ) => ToolCallResult<string> | Promise<ToolCallResult<string>>,
    ): Registration;
    (
      event: 'tool.call',
      matcher: { tool: 'Write' },
      handler: (
        $: EngineInterface,
        e: WriteVariant,
        next: (e: ToolCallInput) => Promise<ToolCallResult<string>>,
      ) => ToolCallResult<string> | Promise<ToolCallResult<string>>,
    ): Registration;
    (
      event: 'tool.call',
      matcher: { tool: ReadonlyArray<'Write' | 'NotebookEdit'> },
      handler: (
        $: EngineInterface,
        e: WriteVariant | NotebookEditVariant,
        next: (e: ToolCallInput) => Promise<ToolCallResult<string>>,
      ) => ToolCallResult<string> | Promise<ToolCallResult<string>>,
    ): Registration;
    (
      event: 'tool.check',
      handler: (
        $: EngineInterface,
        e: ToolCheckInput,
        next: (e: ToolCheckInput) => Promise<ToolCheckResult>,
      ) => ToolCheckResult | Promise<ToolCheckResult>,
    ): Registration;
    (
      event: 'tool.check',
      matcher: { tool: 'Bash' },
      handler: (
        $: EngineInterface,
        e: ToolCheckInput,
        next: (e: ToolCheckInput) => Promise<ToolCheckResult>,
      ) => ToolCheckResult | Promise<ToolCheckResult>,
    ): Registration;
    (
      event: 'session.start',
      handler: (
        $: EngineInterface,
        e: SessionStartInput,
        next: (e: SessionStartInput) => Promise<unknown>,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'turn.start',
      handler: (
        $: EngineInterface,
        e: TurnStartInput,
        next: (e: TurnStartInput) => Promise<unknown>,
      ) => Promise<unknown> | unknown,
    ): Registration;
    (
      event: 'turn.complete',
      handler: (
        $: EngineInterface,
        e: TurnCompleteInput,
        next: (e: TurnCompleteInput) => Promise<unknown>,
      ) => Promise<unknown> | unknown,
    ): Registration;
    // turn.step streams: the hook is an async generator delegating with
    // `const result = yield* next(e)` (forwarding every chunk).
    (
      event: 'turn.step',
      handler: (
        $: EngineInterface,
        e: TurnStepInput,
        next: (e: TurnStepInput) => AsyncGenerator<unknown, TurnStepResult, unknown>,
      ) => AsyncGenerator<unknown, TurnStepResult, unknown>,
    ): Registration;
    (
      event: 'agent.spawn',
      handler: (
        $: EngineInterface,
        e: AgentSpawnInput,
        next: (e: AgentSpawnInput) => Promise<unknown>,
      ) => Promise<unknown> | unknown,
    ): Registration;
  }

  // ─── The register function every mod exports ─────────────────────
  // The host calls it once on load with `on`.
  export type Register = (on: On) => void;

  // ─── State helpers (official runtime exports of 'claude-code') ────
  // The official way to touch $.state: declare an atom per key, then
  // read/update through it. The official signatures type the ref against
  // the merged PluginState; this vendored copy keeps the ref permissive
  // so hooks typecheck standalone.
  export interface Atom<T> {
    readonly ref: StateRef;
    readonly initial: T;
  }
  // Example: const POLICY = atom({ plugin: 'p', key: 'k' } as const, DEFAULT);
  export declare function atom<T>(ref: StateRef & object, initial: T): Atom<T>;
  // Resolves to the stored value, or the atom's initial when unset.
  export declare function read<T>($: EngineInterface, a: Atom<T>): Promise<T>;
  // Applies fn to the current value (initial when unset) and stores it.
  export declare function update<T>(
    $: EngineInterface,
    a: Atom<T>,
    fn: (value: T) => T,
  ): Promise<T>;
}
