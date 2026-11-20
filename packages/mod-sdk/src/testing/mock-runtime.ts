// packages/mod-sdk/src/testing/mock-runtime.ts
//
// MockRuntime: captures registered handlers and lets tests fire events
// without launching Claude Code. This is the testing utility RESEARCH.md §6
// recommends ("packages/testing should make event middleware testable
// without starting a Claude Code session").
//
// The mock also implements the ModsApi surface (ui.log, fs.read/write,
// state.get/set, http.fetch) so handlers can call `$` in tests.

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
}

export interface FireResult {
  // The value returned by the handler chain. May be undefined if the
  // handler called next() and the terminal next returned undefined.
  value: unknown;
  // True if any handler returned a result without calling next (answer).
  answered: boolean;
  // True if the chain forwarded to next (observe/rewrite).
  forwarded: boolean;
}

export class MockRuntime {
  private registrations: Array<Registration> = [];
  private logs: string[] = [];
  private stateStore: Record<string, unknown> = {};
  private fsStore: Record<string, string> = {};

  private static refKey(ref: StateRef): string {
    return `${ref.plugin}.${ref.key}`;
  }

  readonly api: ModsApi = {
    ui: {
      log: (msg: string) => {
        this.logs.push(msg);
      },
      open: () => {},
      resolve: () => {},
    },
    fs: {
      read: async (path: string) => {
        if (!(path in this.fsStore)) throw new Error(`mock fs: ${path} not found`);
        return this.fsStore[path]!;
      },
      write: async (path: string, content: string) => {
        this.fsStore[path] = content;
      },
    },
    state: {
      get: <T>(ref: StateRef): T | undefined =>
        this.stateStore[MockRuntime.refKey(ref)] as T | undefined,
      set: <T>(ref: StateRef, value: T) => {
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
   * The `on` function passed to a Mod's register(). Captures registrations.
   * Implemented as a plain function with `as On` to satisfy the overloaded
   * type; the runtime accepts (event, handler) or (event, matcher, handler).
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
    this.registrations.push({ event: event as EventName, matcher, handler });
  }) as unknown as On;

  /**
   * Load a Mod by calling its register function with this runtime's `on`.
   */
  load(register: RegisterFn): void {
    register(this.on);
  }

  /**
   * Fire an event. Returns the result of the handler chain.
   */
  async fire<N extends EventName>(event: N, e: EventOf<N>): Promise<FireResult> {
    const matching = this.registrations.filter(
      (r) => r.event === event && this.matcherMatches(r.matcher, e),
    );
    if (matching.length === 0) {
      return { value: undefined, answered: false, forwarded: true };
    }
    let answered = false;
    let forwarded = false;
    const terminalNext = (): unknown => {
      forwarded = true;
      return undefined;
    };
    let chain: (ev: EventOf<N>) => Promise<unknown> | unknown = terminalNext;
    for (let i = matching.length - 1; i >= 0; i--) {
      const reg = matching[i];
      if (!reg) continue;
      const currentNext = chain;
      const currentHandler = reg.handler;
      chain = async (ev: EventOf<N>): Promise<unknown> => {
        // The handler signature is ($, e, next). We pass our api, the event,
        // and the current next chain.
        const out = await currentHandler(this.api as never, ev as never, currentNext as never);
        // Streaming handlers (async function*) yield chunks and return the
        // result; drain the generator and use its return value like a
        // normal handler's result.
        const result = await MockRuntime.drainIfGenerator(out);
        if (result !== undefined) {
          answered = true;
          return result;
        }
        forwarded = true;
        return undefined;
      };
    }
    const value = await chain(e);
    return { value, answered, forwarded };
  }

  /**
   * If `out` is an async generator (a streaming handler ran), drain its
   * yielded chunks and return its return value; otherwise return `out`.
   */
  private static async drainIfGenerator(out: unknown): Promise<unknown> {
    if (
      out !== null &&
      typeof out === 'object' &&
      typeof (out as AsyncGenerator).next === 'function' &&
      typeof (out as AsyncGenerator)[Symbol.asyncIterator] === 'function'
    ) {
      const it = (out as AsyncGenerator)[Symbol.asyncIterator]();
      let r = await it.next();
      while (!r.done) {
        r = await it.next();
      }
      return r.value;
    }
    return out;
  }

  /**
   * Get the captured UI logs (from $.ui.log calls).
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Get the number of registrations for a given event.
   */
  registrationCount(event?: EventName): number {
    if (event === undefined) return this.registrations.length;
    return this.registrations.filter((r) => r.event === event).length;
  }

  /**
   * Set mock filesystem content for $.fs.read.
   */
  setFile(path: string, content: string): void {
    this.fsStore[path] = content;
  }

  /**
   * Get the recorded state (for assertions).
   */
  getState<T>(ref: StateRef): T | undefined {
    return this.stateStore[MockRuntime.refKey(ref)] as T | undefined;
  }

  private matcherMatches<N extends EventName>(
    matcher: Matcher | undefined,
    e: EventOf<N>,
  ): boolean {
    if (!matcher) return true;
    if (matcher.tool !== undefined) {
      const tool = (e as unknown as { tool?: unknown }).tool;
      if (tool !== matcher.tool) return false;
    }
    return true;
  }
}
