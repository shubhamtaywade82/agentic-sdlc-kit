// packages/core/src/verification/command-timeout.test.ts
//
// One source for the command timeout. The runner enforces it and the protocol
// advertises it (NextAction.constraints.timeoutMs), so both must read the same
// function. A malformed KIT_TIMEOUT_MS falls back to the default, never to NaN.
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMMAND_TIMEOUT_MS, resolveCommandTimeoutMs } from './process-runner.js';

describe('resolveCommandTimeoutMs', () => {
  it('defaults to 180 seconds', () => {
    expect(DEFAULT_COMMAND_TIMEOUT_MS).toBe(180_000);
    expect(resolveCommandTimeoutMs({})).toBe(180_000);
  });

  it('honours a valid KIT_TIMEOUT_MS', () => {
    expect(resolveCommandTimeoutMs({ KIT_TIMEOUT_MS: '5000' })).toBe(5000);
  });

  it('falls back to the default for values that are not a positive number', () => {
    for (const raw of ['abc', '0', '-5', '']) {
      expect(resolveCommandTimeoutMs({ KIT_TIMEOUT_MS: raw })).toBe(180_000);
    }
  });
});
