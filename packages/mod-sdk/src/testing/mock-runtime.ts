// packages/mod-sdk/src/testing/mock-runtime.ts
//
// MockRuntime: captures registered handlers and lets tests fire events
// without launching Claude Code. This is the testing utility RESEARCH.md §6
// recommends ("packages/testing should make event middleware testable
// without starting a Claude Code session").
//
// The mock mirrors the REAL host contract (official docs, verified
// November 2026), so a test that passes here exercises the shapes Claude
// Code actually delivers:
//   - tool.call events carry the tool's arguments as fields (e.command),
//     tool.check carries them under e.input;
//   - on(...) returns a registration with .catch(handler); when a hook
//     throws, the .catch handler's return value replaces its contribution
//     (and without one the hook is skipped, like the host does);
//   - turn.step's next is an async generator, so `yield* next(e)` works;
//   - $.ui.ask / $.process.run / $.clock.now / $.session.id are mocked
//     explicitly (tests queue answers and process results) — nothing is
//     fabricated behind the test's back.

import type {
  EventName,
  EventOf,
  Matcher,
  ModsApi,
  On,
  RegisterFn,
  StateRef,
} from '../types/events.js';

interface Registration {
  event: EventName;
  matcher?: Matcher;
  // Stored as a loose function; the type narrowing happens at fire() time.
  handler: (...args: never[]) => unknown;
  // The .catch(handler) error handler, if one was chained.
  catchHandler?: (error: unknown) => unknown;
}

export interface FireResult {
  // The value the host would receive from the handler chain (the answer,
  // or what the terminal behavior resolved to).
  value: unknown;
  // True if any handler returned a result without calling next (answer).
  answered: boolean;
  // True if the chain forwarded to the host's own behavior (next called).
  forwarded: boolean;
  // The event the host's own behavior received (set when forwarded) —
  // lets tests assert rewrites (e.g. next({ ...e, model })).
  terminalEvent?: unknown;
  // For streaming events (turn.step): the chunks that were forwarded.
  chunks: unknown[];
}

function isAsyncGenerator(v: unknown): v is AsyncGenerator<unknown, unknown, unknown> {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as AsyncGenerator).next === 'function' &&
    typeof (v as AsyncGenerator)[Symbol.asyncIterator] === 'function'
  );
}

function matcherFieldMatches(field: unknown, value: unknown): boolean {
  if (field instanceof RegExp) {
    return typeof value === 'string' && field.test(value);
  }
  if (Array.isArray(field)) {
    return field.some((f) => matcherFieldMatches(f, value));
  }
  return field === value;
}

export class MockRuntime {
  private registrations: Array<Registration> = [];
  private logs: string[] = [];
  private statuses: string[] = [];
  private stateStore: Record<string, unknown> = {};
  private poisonedStateKeys = new Set<string>();
  private fsStore: Record<string, string> = {};
  private fsListings: Record<string, string[]> = {};
  // $.ui.ask: queued answers popped FIFO; when empty, ask REJECTS (nobody
  // to ask — the same refusal a headless claude -p run produces).
  private askAnswers: string[] = [];
  // $.process.run: queued results popped FIFO; when empty, run throws
  // (tests must be explicit about what git/... would return).
  private processResults: Array<{ stdout: string; stderr: string; exitCode: number }> = [];
  private processCalls: Array<ReadonlyArray<string>> = [];
  private registeredCommands: Array<{ name: string; description: string }> = [];
  private clockNowMs: number;
  private sessionIdentifier = 'session-mock';
  private sessionCwd = '/project';
  // What the host's own behavior (the terminal next) resolves to.
  private hostResult: unknown;
  // Chunks the host would stream for turn.step.
  private hostChunks: unknown[] = [];

  constructor(nowMs: number = Date.parse('2026-11-20T12:00:00.000Z')) {
    this.clockNowMs = nowMs;
  }

  readonly api: ModsApi = {
    ui: {
      log: (msg: string) => {
        this.logs.push(msg);
      },
      status: (text: string) => {
        this.statuses.push(text);
      },
      ask: async (_question: string, _options: ReadonlyArray<string>) => {
        const answer = this.askAnswers.shift();
        if (answer === undefined) {
          throw new Error('mock ask: nobody to ask (headless run)');
        }
        return answer;
      },
    },
    fs: {
      read: async (path: string) => {
        if (!(path in this.fsStore)) throw new Error(`mock fs: ${path} not found`);
        return this.fsStore[path]!;
      },
      write: async (path: string, content: string) => {
        this.fsStore[path] = content;
      },
      exists: async (path: string) => path in this.fsStore || path in this.fsListings,
      list: async (path: string) => {
        const listed = this.fsListings[path];
        if (!listed) throw new Error(`mock fs: ${path} not listable`);
        return [...listed];
      },
    },
    process: {
      run: async (args: ReadonlyArray<string>) => {
        this.processCalls.push(args);
        const result = this.processResults.shift();
        if (result === undefined) {
          throw new Error(`mock process: no result queued for [${args.join(' ')}]`);
        }
        return result;
      },
    },
    command: {
      register: async (cmd: { name: string; description: string }) => {
        this.registeredCommands.push({ name: cmd.name, description: cmd.description });
      },
    },
    session: {
      id: () => this.sessionIdentifier,
      cwd: () => this.sessionCwd,
    },
    clock: {
      now: () => this.clockNowMs,
    },
    state: {
      get: <T>(ref: StateRef): T | undefined => {
        const key = MockRuntime.refKey(ref);
        if (this.poisonedStateKeys.has(key)) {
          throw new Error(`mock state: ${key} is poisoned`);
        }
        return this.stateStore[key] as T | undefined;
      },
      set: <T>(ref: StateRef, value: T): void => {
        this.stateStore[MockRuntime.refKey(ref)] = value;
      },
    },
    http: {
      fetch: async () => {
        throw new Error('mock http: networkAccess not allowed in tests by default');
      },
    },
  };

  /**
   * The `on` function passed to a Mod's register(). Captures registrations
   * and returns a registration object with a .catch(handler) method, the
   * same shape the real host returns.
   */
  readonly on: On = ((event: string, ...rest: unknown[]) => {
    let matcher: Matcher | undefined;
    let handler: (...args: never[]) => unknown;
    if (rest.length === 1) {
      const h = rest[0] as (...args: never[]) => unknown;
      handler = h;
    } else {
      matcher = rest[0] as Matcher;
      handler = rest[1] as (...args: never[]) => unknown;
    }
    const registration: Registration = { event: event as EventName, matcher, handler };
    this.registrations.push(registration);
    return {
      catch: (catchHandler: (error: unknown) => unknown) => {
        registration.catchHandler = catchHandler;
      },
    };
  }) as unknown as On;

  /**
   * Load a Mod by calling its register function with this runtime's `on`.
   */
  load(register: RegisterFn): void {
    register(this.on);
  }

  /**
   * Fire an event. Builds the middleware chain from every registration
   * whose matcher accepts the event (registration order = outside-in, the
   * same order the host stacks hooks) and returns what the host would see.
   */
  async fire<N extends EventName>(event: N, e: EventOf<N>): Promise<FireResult> {
    const matching = this.registrations.filter(
      (r) => r.event === event && this.matcherMatches(r.matcher, e),
    );
    const result: FireResult = { value: undefined, answered: false, forwarded: false, chunks: [] };
    if (matching.length === 0) {
      // No hook matches: the event goes straight to the host's own
      // behavior, unimpeded.
      return { value: this.hostResult, answered: false, forwarded: true, chunks: [] };
    }

    // The host's own behavior: for streaming events it is an async
    // generator (so `yield* next(e)` delegates); otherwise it resolves to
    // the configured host result.
    const terminal = async (ev: EventOf<N>): Promise<unknown> => {
      result.forwarded = true;
      result.terminalEvent = ev;
      return this.hostResult;
    };
    const terminalStream = async function* (
      this: MockRuntime,
      ev: EventOf<N>,
    ): AsyncGenerator<unknown, unknown, unknown> {
      result.forwarded = true;
      result.terminalEvent = ev;
      for (const chunk of this.hostChunks) {
        result.chunks.push(chunk);
        yield chunk;
      }
      return this.hostResult;
    };

    const isStreaming = event === 'turn.step';
    type LinkResult = Promise<unknown> | unknown | AsyncGenerator<unknown, unknown, unknown>;
    let chain: (ev: EventOf<N>) => LinkResult = isStreaming
      ? (ev: EventOf<N>) => terminalStream.call(this, ev)
      : (ev: EventOf<N>) => terminal(ev);

    // Drain a generator to its return value (used on error/skip paths and
    // once at the outermost level).
    const drain = async (gen: AsyncGenerator<unknown, unknown, unknown>): Promise<unknown> => {
      const it = gen[Symbol.asyncIterator]();
      let r = await it.next();
      while (!r.done) {
        r = await it.next();
      }
      return r.value;
    };

    for (let i = matching.length - 1; i >= 0; i--) {
      const reg = matching[i];
      if (!reg) continue;
      const currentNext = chain;
      const currentHandler = reg.handler;
      const currentCatch = reg.catchHandler;
      // Error path: a chained .catch handler replaces the hook's
      // contribution; without one the host SKIPS the hook (the rest of
      // the chain runs as if it weren't there).
      const handleError = async (err: unknown, ev: EventOf<N>): Promise<unknown> => {
        if (currentCatch !== undefined) {
          return currentCatch(err);
        }
        const downstream = currentNext(ev);
        if (isAsyncGenerator(downstream)) {
          return drain(downstream);
        }
        return downstream;
      };
      // The link must pass a downstream GENERATOR through synchronously so
      // an outer streaming handler can delegate with `yield* next(e)`.
      chain = (ev: EventOf<N>): LinkResult => {
        let out: unknown;
        try {
          // The handler signature is ($, e, next).
          out = currentHandler(this.api as never, ev as never, currentNext as never);
        } catch (err) {
          return handleError(err, ev);
        }
        if (
          out !== null &&
          typeof out === 'object' &&
          typeof (out as PromiseLike<unknown>).then === 'function' &&
          !isAsyncGenerator(out)
        ) {
          // A plain async handler: route rejections through the error path.
          return (out as Promise<unknown>).then(undefined, (err) => handleError(err, ev));
        }
        return out;
      };
    }

    // Run the outermost link. A streaming handler surfaces a generator —
    // drain it (its yields already forwarded through the chain).
    let value: unknown;
    const outer = chain(e);
    if (isAsyncGenerator(outer)) {
      value = await drain(outer);
    } else {
      value = await outer;
    }
    result.value = value;
    // `answered` = the chain produced a value the host alone would not
    // have: a hook short-circuited (or rewrote the result) instead of
    // merely forwarding the host's own behavior.
    result.answered = value !== undefined && !(result.forwarded && value === this.hostResult);
    return result;
  }

  /**
   * Get the captured UI logs (from $.ui.log calls).
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Get the captured status lines (from $.ui.status calls).
   */
  getStatuses(): string[] {
    return [...this.statuses];
  }

  /**
   * Get the number of registrations for a given event.
   */
  registrationCount(event?: EventName): number {
    if (event === undefined) return this.registrations.length;
    return this.registrations.filter((r) => r.event === event).length;
  }

  /** Set mock filesystem content for $.fs.read. */
  setFile(path: string, content: string): void {
    this.fsStore[path] = content;
  }

  /** Set a mock directory listing for $.fs.list. */
  setListing(path: string, entries: string[]): void {
    this.fsListings[path] = entries;
  }

  /** Get the recorded state (for assertions). */
  getState<T>(ref: StateRef): T | undefined {
    return this.stateStore[MockRuntime.refKey(ref)] as T | undefined;
  }

  /** Set state a test wants a hook to read via $.state.get. */
  setState<T>(ref: StateRef, value: T): void {
    this.stateStore[MockRuntime.refKey(ref)] = value;
  }

  /** Make $.state.get throw for a key (to exercise fail-closed .catch). */
  poisonState(plugin: string, key: string): void {
    this.poisonedStateKeys.add(`${plugin}.${key}`);
  }

  /** Queue the labels $.ui.ask resolves to, in order (FIFO). */
  queueAskAnswers(...answers: string[]): void {
    this.askAnswers.push(...answers);
  }

  /** Queue $.process.run results, in order (FIFO). */
  queueProcessResults(...results: Array<{ stdout: string; stderr?: string; exitCode?: number }>): void {
    this.processResults.push(
      ...results.map((r) => ({
        stdout: r.stdout,
        stderr: r.stderr ?? '',
        exitCode: r.exitCode ?? 0,
      })),
    );
  }

  /** The argument arrays $.process.run was called with, in order. */
  getProcessCalls(): Array<ReadonlyArray<string>> {
    return [...this.processCalls];
  }

  /** Commands registered via $.command.register. */
  getRegisteredCommands(): Array<{ name: string; description: string }> {
    return [...this.registeredCommands];
  }

  /** Set what the host's own behavior resolves to (the terminal next). */
  setHostResult(value: unknown): void {
    this.hostResult = value;
  }

  /** Set the chunks the host streams for turn.step. */
  setHostChunks(chunks: unknown[]): void {
    this.hostChunks = [...chunks];
  }

  /** Set the mock clock (ms since epoch) — $.clock.now() returns it. */
  setNow(nowMs: number): void {
    this.clockNowMs = nowMs;
  }

  /** Advance the mock clock. */
  advanceClock(ms: number): void {
    this.clockNowMs += ms;
  }

  /** The current mock clock value. */
  now(): number {
    return this.clockNowMs;
  }

  /** Set the session identity $.session.id() returns. */
  setSession(sessionId: string, cwd: string = '/project'): void {
    this.sessionIdentifier = sessionId;
    this.sessionCwd = cwd;
  }

  private static refKey(ref: StateRef): string {
    return `${ref.plugin}.${ref.key}`;
  }

  private matcherMatches<N extends EventName>(matcher: Matcher | undefined, e: EventOf<N>): boolean {
    if (!matcher) return true;
    if (matcher.tool !== undefined) {
      const tool = (e as unknown as { tool?: unknown }).tool;
      if (!matcherFieldMatches(matcher.tool, tool)) return false;
    }
    if (matcher.command !== undefined) {
      const command = (e as unknown as { command?: unknown }).command;
      if (!matcherFieldMatches(matcher.command, command)) return false;
    }
    if (matcher.isReadOnly !== undefined) {
      const isReadOnly = (e as unknown as { isReadOnly?: unknown }).isReadOnly;
      if (!matcherFieldMatches(matcher.isReadOnly, isReadOnly)) return false;
    }
    return true;
  }
}
