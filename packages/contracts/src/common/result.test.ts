// packages/contracts/src/common/result.test.ts
import { describe, expect, it } from 'vitest';
import { err, mapErr, mapOk, ok, unwrap, type Result } from './result.js';
import { Errors } from './errors.js';

describe('result.ok', () => {
  it('constructs an Ok value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(42);
  });
});

describe('result.err', () => {
  it('constructs an Err value', () => {
    const e = err(Errors.internal('boom'));
    expect(e.ok).toBe(false);
    expect(e.error.code).toBe('INTERNAL');
    expect(e.error.message).toBe('boom');
  });
});

describe('result.unwrap', () => {
  it('returns the value for Ok', () => {
    expect(unwrap(ok('x'))).toBe('x');
  });
  it('throws for Err', () => {
    expect(() => unwrap(err(Errors.internal('boom')))).toThrow(/unwrap called on Err/);
  });
});

describe('result.mapOk', () => {
  it('applies the function to Ok', () => {
    expect(mapOk(ok(2), (n) => n * 3)).toEqual(ok(6));
  });
  it('passes Err through unchanged', () => {
    const e: Result<number> = err(Errors.internal('x'));
    expect(mapOk(e, (n) => n * 3)).toBe(e);
  });
});

describe('result.mapErr', () => {
  it('applies the function to Err', () => {
    const r = mapErr(err(Errors.internal('a')), (e) => Errors.internal(e.message + 'b'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('ab');
  });
  it('passes Ok through unchanged', () => {
    const o = ok(1);
    expect(mapErr(o, (e) => Errors.internal(e.message))).toBe(o);
  });
});
