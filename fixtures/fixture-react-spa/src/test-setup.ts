import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest is configured without `globals: true`, so React Testing Library's
// automatic cleanup never registers itself — clean up explicitly between
// tests to avoid "Found multiple elements" errors from accumulated renders.
afterEach(() => {
  cleanup()
})
