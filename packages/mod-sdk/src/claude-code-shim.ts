// packages/mod-sdk/src/claude-code-shim.ts
//
// Test-time implementation of the RUNTIME values a hooks module imports
// from the bare 'claude-code' specifier (the official state helpers
// atom / read / update — see plugins/<name>/hooks/register.ts). In a
// real session the Claude Code engine supplies them; in the kit's tests
// each plugin's vitest.config.ts aliases 'claude-code' to this module,
// whose helpers are thin wrappers over the MockRuntime's $.state (the
// same place the engine's own helpers bottom out).
//
// The signatures mirror the vendored official declarations in
// plugins/<name>/.claude-plugin/types/claude-code/index.d.ts: read()
// resolves to the stored value or the atom's initial; update() applies
// fn to the current value and stores the result.

import type { ModsApi } from './types/events.js';

/** A typed reference to one { plugin, key } state slot. */
export interface Atom<T> {
  readonly ref: { readonly plugin: string; readonly key: string };
  readonly initial: T;
}

/** Create an atom over one state slot; `initial` is the read fallback. */
export function atom<T>(ref: { plugin: string; key: string } & object, initial: T): Atom<T> {
  return { ref, initial };
}

/** The $ surface the helpers need (a real `$` or the MockRuntime's). */
type StateApi = Pick<ModsApi, 'state'>;

/** Resolve the atom's stored value, or its initial when nothing is set. */
export async function read<T>($: StateApi, a: Atom<T>): Promise<T> {
  const stored = await $.state.get<T>(a.ref);
  return stored.value ?? a.initial;
}

/** Apply fn to the current value (initial when unset) and store it. */
export async function update<T>($: StateApi, a: Atom<T>, fn: (value: T) => T): Promise<T> {
  const value = fn(await read<T>($, a));
  await $.state.set(a.ref, value);
  return value;
}
