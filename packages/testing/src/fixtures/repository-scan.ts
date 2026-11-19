// packages/testing/src/fixtures/repository-scan.ts
//
// Sample RepositoryScan inputs for unit tests.

import type { RepositoryScan } from '@agentic-sdlc-kit/contracts';

export const nodeFullstackScan: RepositoryScan = {
  root: '/repo/fixture-node-fullstack',
  detectedStacks: ['node-typescript', 'react'],
  packageManagers: ['pnpm'],
  entryPoints: ['src/index.ts', 'src/server.ts'],
  testFrameworks: ['vitest'],
  hasMigrations: true,
  hasCi: true,
  agentInstructionFiles: ['CLAUDE.md'],
  git: {
    branch: 'main',
    dirty: false,
    headSha: '0123456789abcdef0123456789abcdef01234567',
  },
};

export const emptyStacksScan: RepositoryScan = {
  ...nodeFullstackScan,
  detectedStacks: [],
};

export const dirtyGitScan: RepositoryScan = {
  ...nodeFullstackScan,
  git: { ...nodeFullstackScan.git, dirty: true },
};
