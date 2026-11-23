import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/ — vitest 2 re-exports defineConfig from 'vitest/config'
// so the `test` property is part of the config type.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    // Playwright e2e specs live in e2e/ and must not be collected by vitest.
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
  },
})
