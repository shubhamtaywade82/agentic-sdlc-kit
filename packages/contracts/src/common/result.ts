// packages/contracts/src/common/result.ts
//
// Result<T, E> is the standard return shape for every function in `core`
// and `cli` that can fail in an expected way. Exceptions are reserved for
// programmer errors (e.g., violating an architectural invariant).
//
// See docs/contracts/CONTRACTS.md §1.1 and ADR-0007.

import type { KitError } from './errors.js';

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = KitError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/**
 * Type-level exhaustiveness helper. Returns the error if `result` is `Err`,
 * otherwise throws (programmer error: the caller should have checked `ok`
 * first). Used in tests and in code paths where a `Err` is genuinely
 * impossible by construction.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap called on Err: ${JSON.stringify(result.error)}`);
}

/**
 * Functional map over the Ok value. Passes through Err unchanged.
 */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Functional map over the Err value. Passes through Ok unchanged.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}
