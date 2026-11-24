// tools/ci-agent/test/harness.ts
//
// Tiny assertion helpers + registrar type for the agent's offline unit
// suite (no external test framework — the package stays dependency-light).
// Nothing here touches Ollama Cloud; see run.ts.

export type Registrar = (name: string, fn: () => void | Promise<void>) => void;

interface TestCase {
  readonly name: string;
  readonly fn: () => void | Promise<void>;
}

const cases: TestCase[] = [];

/** Register a test case (called by each *.test.ts module's register()). */
export function test(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn });
}

/** All registered cases, in registration order (run.ts iterates these). */
export function registered(): readonly TestCase[] {
  return cases;
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

export function assertEqual<T>(actual: T, expected: T, label = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`assertion failed${label === '' ? '' : ` (${label})`}: expected ${e}, got ${a}`);
  }
}

/** Synchronous throw check with an optional message substring. */
export function assertThrows(fn: () => unknown, messageIncludes = ''): void {
  try {
    fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (messageIncludes !== '' && !message.includes(messageIncludes)) {
      throw new Error(`threw an unexpected error: ${message}`);
    }
    return;
  }
  throw new Error('expected an error but none was thrown');
}

/** Grab-and-restore for process.env so sequential tests stay isolated. */
export function withEnv(values: Record<string, string | undefined>, fn: () => void | Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}
