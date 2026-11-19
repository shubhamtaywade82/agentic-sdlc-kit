# @agentic-sdlc-kit/testing

Shared test utilities for the kit's own tests and for fixture assertions.

## Architectural invariant

This package imports only from `@agentic-sdlc-kit/contracts` and `vitest`.
It MUST NOT import from `core`, `cli`, or any adapter.

See `docs/architecture/ARCHITECTURE.md` §2.4, §6.

## Public surface (M1)

- `fixtures/project-profile.ts` — valid and invalid profile samples.
- `fixtures/repository-scan.ts` — scan samples.
- `assertions/result.ts` — `assertOk`, `assertErr`, `assertOkWith`,
  `assertErrCode`.
- `validators/contracts.ts` — round-trip validators for every public
  schema.
- `validators/path-escape.ts` — `assertDenied` for artifact writer tests.
- `helpers/temp-dir.ts` — `makeTempDir()` for filesystem tests.

## Usage

```ts
import {
  validProfile,
  invalidShellStringCommand,
  validateProjectProfile,
  assertOk,
} from '@agentic-sdlc-kit/testing';
import { validateProfile } from '@agentic-sdlc-kit/core';

it('accepts a valid profile', () => {
  const r = validateProfile(validProfile);
  assertOk(r);
});

it('rejects a shell-string command', () => {
  expect(() => validateProjectProfile(invalidShellStringCommand)).toThrow();
});
```
