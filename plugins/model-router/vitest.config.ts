import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 'claude-code' is type-only for the host (an ambient module), but the
// hooks also import the official state helpers (atom/read/update) as
// RUNTIME values. A real Claude Code session supplies them; in tests the
// alias points them at the kit's shim, which wraps the MockRuntime's
// $.state — the same place the engine's own helpers bottom out.
export default defineConfig({
  resolve: {
    alias: {
      'claude-code': path.resolve(__dirname, '../../packages/mod-sdk/src/claude-code-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
