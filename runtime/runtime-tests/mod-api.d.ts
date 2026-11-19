/**
 * DEV-HARNESS ambient declarations of the Claude Code Mods API surface used by
 * this kit's hooks. NOT part of any plugin and never shipped inside a mod
 * directory — Claude Code provides the real API types at runtime (hooks are
 * loaded directly as erasable TypeScript; all annotations below are erased).
 *
 * This file exists only so `npm test` in runtime/ can typecheck the four
 * hooks/register.ts files with tsc (tsconfig.hooks.json, noEmit).
 *
 * Kept deliberately small and module-free (no import/export statements) so the
 * types below are available as globals to the hook files.
 */

/** The `$` object passed as the first argument of every hook invocation. */
interface ModApi {
  ui: {
    /** Dim transcript line. Claude does NOT read it. */
    log(text: string): void;
    /** Status line under the prompt. */
    status(text: string): void;
    /**
     * Modal question. Resolves to the chosen label string.
     * Rejects when dismissed or there is nobody to ask (catch → treat as refuse).
     * Time in ask does not count against the hook time budget.
     */
    ask(question: string, options: string[]): Promise<string>;
  };
  fs: {
    /** Path resolves against the session working directory. */
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    list(path: string): Promise<string[]>;
  };
  /** Runs with an argument array, NO shell. */
  process: {
    run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  command: {
    register(cmd: { name: string; description: string; argumentHint?: string }): Promise<void>;
  };
  session: {
    id(): string;
    /** Session working directory — the base $.fs paths resolve against. */
    cwd(): string;
  };
  clock: {
    now(): number;
  };
}

/**
 * `next(e)` passes the (possibly rewritten) event down the middleware chain.
 * Awaitable for regular hooks; delegatable with `yield*` for async-generator
 * hooks (turn.step). `signal` is reserved by the runtime.
 */
type NextFn = {
  (e: any): Promise<any> & AsyncIterable<any>;
  signal?: unknown;
};

/** Hook signature: `async ($, e, next) => ...` (turn.step uses an async generator). */
type ModHandler = ($: ModApi, e: any, next: NextFn) => unknown;

/** Returned by `on(...)` — `.catch(handler)` makes a gating hook fail closed. */
interface Registration {
  catch(handler: (error: unknown) => unknown): Registration;
}

/** Event matcher: string = exact, array = any-of, RegExp = pattern (per field). */
interface EventMatcher {
  [field: string]: string | string[] | RegExp;
}

/** `on(eventName, matcher?, hook)` — registers a hook for one event+matcher. */
interface OnFn {
  (event: string, handler: ModHandler): Registration;
  (event: string, matcher: EventMatcher, handler: ModHandler): Registration;
}

/** `register(on, options)` — the module entry point called once on plugin load. */
interface RegisterOptions {
  [key: string]: unknown;
}
