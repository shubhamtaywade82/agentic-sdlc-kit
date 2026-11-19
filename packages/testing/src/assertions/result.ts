// packages/testing/src/assertions/result.ts
//
// Result-shaped assertions. These throw on mismatch (vitest assertions).

import { expect } from 'vitest';
import type { Result } from '@agentic-sdlc-kit/contracts';

export function assertOk<T, E>(r: Result<T, E>): T {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  return r.value;
}

export function assertErr<T, E>(r: Result<T, E>): E {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error('expected Err, got Ok');
  return r.error;
}

export function assertOkWith<T, E>(r: Result<T, E>, expected: T): void {
  const value = assertOk(r);
  expect(value).toEqual(expected);
}

export function assertErrCode<T>(r: Result<T>, code: string): void {
  const err = assertErr(r);
  expect(err.code).toBe(code);
}
