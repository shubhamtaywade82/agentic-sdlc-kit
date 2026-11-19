# fixture-node-fullstack

A minimal but real Node.js + TypeScript + Express-style application with a
passing test. **Target of the first M2 `kit inspect` dry-run.**

## Why this fixture exists

The kit's acceptance criteria require validating against an actual existing
application, not a toy repository (`docs/roadmap/ROADMAP.md` §9, M7
acceptance test). This fixture is the **first** such application: it has
business logic, an entry point, an HTTP API, a passing test, existing
conventions, and a `.ai-kit/project.yml` that matches what `kit init`
would produce.

## Layout

```
fixture-node-fullstack/
├── src/
│   └── index.js          # http server with / and /health endpoints
├── tests/
│   └── index.test.js     # 3 passing tests using node:test
├── docs/
│   └── NOTES.md          # engineering notes (existing convention)
├── .ai-kit/
│   └── project.yml       # the profile `kit init` would produce
├── AGENTS.md             # existing agent instruction file
├── package.json
└── README.md (this file)
```

## Running the fixture (standalone)

```bash
cd fixtures/fixture-node-fullstack
node src/index.js         # starts on http://localhost:3000
node --test tests/        # runs the 3 tests
```

The fixture has **no dependencies**. It uses Node's built-in `http` and
`node:test` modules so `kit inspect` can scan it without running
`npm install` first.

## What the kit does with this fixture

- **M2 `kit inspect`**: scans the fixture read-only, detects
  `node-typescript`-adjacent stack, produces a `RepositoryScan` and a
  proposed `ProjectProfile`. The scan must NOT modify any file in the
  fixture.
- **M7 `/kit:feature`**: the kit takes a feature request (e.g., "add a
  POST /echo endpoint"), produces a spec, a plan, an implementation with
  tests, a verification report, and a review — without losing the original
  fixture state.

## Adversarial extensions (M17)

Later milestones extend this fixture with deliberately injected failures
(failing tests, dirty git state, secret-containing files, destructive
commands). For 0.1 the fixture is clean and is only the **target** of
inspection; it is not yet an adversarial environment.

## License

MIT, same as the kit.
