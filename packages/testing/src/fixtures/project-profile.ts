// packages/testing/src/fixtures/project-profile.ts
//
// Sample valid and invalid ProjectProfile inputs for unit tests.

import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';

export const validProfile: ProjectProfile = {
  schemaVersion: 1,
  name: 'fixture-node-fullstack',
  stack: ['node-typescript', 'react'],
  commands: {
    test: [['pnpm', 'test']],
    lint: [['pnpm', 'lint']],
    typecheck: [['pnpm', 'typecheck']],
    build: [['pnpm', 'build']],
  },
};

export const minimalProfile: ProjectProfile = {
  schemaVersion: 1,
  name: 'x',
  stack: ['node-typescript'],
  commands: {},
};

/**
 * A profile that uses a shell string command — invalid per the contract.
 */
export const invalidShellStringCommand: unknown = {
  schemaVersion: 1,
  name: 'bad',
  stack: ['node-typescript'],
  commands: { test: 'pnpm test' },
};

/**
 * A profile missing schemaVersion — invalid.
 */
export const invalidMissingSchemaVersion: unknown = {
  name: 'bad',
  stack: ['node-typescript'],
  commands: {},
};

/**
 * A profile with an empty stack — invalid.
 */
export const invalidEmptyStack: unknown = {
  schemaVersion: 1,
  name: 'bad',
  stack: [],
  commands: {},
};

/**
 * A profile with mixed-case stack — invalid.
 */
export const invalidMixedCaseStack: unknown = {
  schemaVersion: 1,
  name: 'bad',
  stack: ['Node-TypeScript'],
  commands: {},
};
