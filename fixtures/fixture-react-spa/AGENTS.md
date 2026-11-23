# AGENTS.md — fixture-react-spa

This file exists so the kit's M2 discovery can find and respect an existing
agent instruction file in the target repository.

## Conventions

- Vite + React + TypeScript SPA (`react-ts` template layout).
- Component tests use vitest + React Testing Library (jsdom); run with
  `pnpm test`.
- E2E tests use Playwright (chromium); run `pnpm exec playwright install
  chromium` once, then `pnpm test:e2e`.
- Lint with oxlint (`pnpm lint`); build with `pnpm build`.
- One component per file under `src/components/`; a colocated
  `<Name>.test.tsx` for every component.
- Buttons are `<button type="button">`; queries use ByRole with accessible
  names.

## What an AI assistant working in this repository should do

- Follow the conventions above.
- Add or update the component test (and e2e coverage when behavior is
  user-visible) for any new behavior.
- Run `pnpm test && pnpm lint && pnpm build` before claiming done.
- Do not add dependencies unless absolutely necessary.
- Do not modify the tsconfig project references or the vitest/Playwright
  configs without explicit approval.
