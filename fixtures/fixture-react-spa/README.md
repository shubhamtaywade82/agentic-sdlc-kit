# fixture-react-spa

A minimal but real React + TypeScript single-page application with passing
component tests and Playwright e2e tests. **The fourth reference fixture for
the Agentic SDLC Kit**, and the first that exercises the `react-typescript`
stack pack end to end — including a real browser e2e lane in CI.

## Why this fixture exists

The `react-typescript` stack pack (vitest + Playwright conventions, Next.js
entry points) was declared but never exercised: no reference repository,
no browser in CI, and no Playwright failure output in the verification
classifier. This fixture closes that gap:

- `kit inspect` / `kit init` detect the stack and derive working
  `test` / `lint` / `build` commands.
- `kit verify` runs the full profile (vitest, oxlint, `tsc -b && vite build`)
  — green in CI.
- The CI lane installs Playwright's chromium and runs the e2e suite, the
  kit's first real browser run.
- The verification classifier recognizes Playwright locator-assertion
  failures (`expect(locator).toHaveText(...)`) and the reporter's bare
  `N failed` summary line as Red-phase assertion failures.

## Layout

```
fixture-react-spa/
├── e2e/
│   └── smoke.spec.ts         # Playwright: heading renders, counter increments
├── src/
│   ├── components/
│   │   ├── Counter.tsx       # useState counter button
│   │   └── Counter.test.tsx  # 2 vitest + RTL examples
│   ├── App.tsx               # heading + Counter
│   ├── App.test.tsx          # 2 vitest + RTL examples
│   ├── main.tsx
│   ├── index.css
│   └── test-setup.ts         # RTL cleanup between tests
├── .ai-kit/project.yml       # the profile `kit init` produces
├── docs/NOTES.md             # engineering notes (existing convention)
├── playwright.config.ts      # chromium; webServer: pnpm preview
├── vite.config.ts            # vitest config (jsdom, e2e excluded)
├── tsconfig{,.app,.node}.json
├── AGENTS.md
├── index.html
├── package.json              # pnpm@12.21.0, react 19, vite 8, vitest 5
└── README.md (this file)
```

## Running the fixture (standalone)

```bash
cd fixtures/fixture-react-spa
pnpm install                  # workspace member: deps come from the root lockfile
pnpm test                     # vitest: 4 component tests
pnpm lint                     # oxlint
pnpm build                    # tsc -b && vite build
pnpm exec playwright install chromium   # once, for the browser
pnpm test:e2e                 # Playwright: 2 e2e tests against vite preview
```

## Notes on the workspace setup

The fixture is a pnpm workspace member (`fixtures/*` in the root
`pnpm-workspace.yaml`), so its dependencies live in the repository-root
lockfile and there is no fixture-level lockfile. Consequently the kit's
package-manager scan reports `npm` and derives npm-style commands — which
run the same package.json scripts and pass identically (proven by
`kit verify` in CI). A standalone checkout would derive pnpm commands.

## What the kit does with this fixture

- **M2 `kit inspect`**: detects `react-typescript, node-typescript`, test
  tooling `vitest`, reads `AGENTS.md`.
- **Feature workflow / Tier C conformance**: the task verification command
  (`npm test` / `pnpm test`) runs vitest; the evidence gate classifies a
  failing vitest or Playwright run as `assertion` (Red) and a passing run
  as `Green` — the `fixture-react` CI lane proves both against real runs.

## License

MIT, same as the kit.
