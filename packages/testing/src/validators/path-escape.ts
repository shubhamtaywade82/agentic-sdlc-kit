// packages/testing/src/validators/path-escape.ts
//
// Validates the architectural invariant (ARCHITECTURE.md §6, SECURITY.md §2)
// that artifact paths cannot escape .ai-kit/ or docs/. Used by the
// core.artifacts.writer tests.

import { expect } from 'vitest';
import type { Result } from '@agentic-sdlc-kit/contracts';

export function assertDenied(r: Result<unknown>): void {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error('expected Err');
  expect(r.error.code).toBe('ARTIFACT_WRITE_DENIED');
}
