# Agentic SDLC Kit — Release 0.1 (M0 + M1)

This is the first concrete implementation package described at the end of
the roadmap (`docs/roadmap/ROADMAP.md` §25):

> The first concrete implementation package should therefore be:
>
> - M0 artifact freeze.
> - M1 tasks M1-01 through M1-11.
> - A clean CI baseline.
> - A reference fixture for the first M2/M7 integration path.

## What is in this zip

```
agentic-sdlc-kit/
├── .github/workflows/ci.yml       # M1-11: baseline CI (matrix + shellcheck)
├── .gitignore
├── .npmrc
├── .prettierignore
├── .prettierrc.json
├── CONTRIBUTING.md                # M1-10
├── LICENSE                        # MIT
├── README.md                      # M1-10
├── docs/                          # M0 artifact freeze (10 docs + 9 ADRs)
│   ├── product/PRODUCT.md
│   ├── requirements/REQUIREMENTS.md
│   ├── architecture/ARCHITECTURE.md
│   ├── modules/MODULES.md
│   ├── workflows/WORKFLOWS.md
│   ├── contracts/CONTRACTS.md
│   ├── security/SECURITY.md
│   ├── testing/TESTING.md
│   ├── roadmap/ROADMAP.md
│   └── adr/
│       ├── ADR-0001-typescript-primary-language.md
│       ├── ADR-0002-pnpm-workspaces.md
│       ├── ADR-0003-modular-monorepo.md
│       ├── ADR-0004-runtime-independent-core.md
│       ├── ADR-0005-claude-code-first-adapter.md
│       ├── ADR-0006-independently-installable-plugins.md
│       ├── ADR-0007-shared-contracts-workflow-engine.md
│       ├── ADR-0008-project-yml-configuration.md
│       └── ADR-0009-explicit-approval-least-privilege.md
├── eslint.config.js               # M1-09
├── fixtures/                      # M0/M1 reference fixture
│   ├── README.md
│   └── fixture-node-fullstack/
│       ├── .ai-kit/project.yml    # the profile `kit init` would produce
│       ├── AGENTS.md              # existing agent instructions
│       ├── README.md
│       ├── docs/NOTES.md
│       ├── package.json
│       ├── src/index.js           # http server with / and /health
│       └── tests/index.test.js    # 3 passing tests (node:test)
├── package.json                   # M1-01
├── packages/
│   ├── claude-code-adapter/       # M1: boundary declaration only (ADR-0005)
│   ├── cli/                       # M1-05: kit --version, --help, doctor
│   ├── contracts/                 # M1-03 + M1-07 + M1-08
│   ├── core/                      # M1-04: runtime-independent
│   └── testing/                   # M1-06
├── pnpm-workspace.yaml            # M1-01
├── scripts/
│   ├── check-architecture.ts      # M1-09: enforces ARCHITECTURE.md §6
│   ├── package.json
│   └── tsconfig.json
└── tsconfig.base.json             # M1-02
```

## How to verify (clean checkout)

```bash
unzip agentic-sdlc-kit-0.1.0.zip
cd agentic-sdlc-kit
corepack enable                 # picks up pnpm@9.12.0
pnpm install --frozen-lockfile
pnpm verify                     # architecture → build → lint → typecheck → test
```

Expected: **200 tests across 5 packages, all green**; architecture
invariants hold; CLI smokes pass.

```bash
# CLI smoke
node packages/cli/dist/index.js --version    # 0.1.0
node packages/cli/dist/index.js --help       # lists commands
node packages/cli/dist/index.js doctor       # checks toolchain health

# Fixture smoke (no install needed — the fixture has no deps)
cd fixtures/fixture-node-fullstack
node --test tests/index.test.js              # 3 tests pass
PORT=3999 node src/index.js &                # server starts
curl -s http://localhost:3999/               # {"message":"hello from fixture-node-fullstack"}
```

## M1 acceptance criteria (`docs/roadmap/ROADMAP.md` §3.3)

| #   | Criterion                                                      | Status                                                     |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | All workspace packages build successfully                      | ✅ 5/5 packages built                                      |
| 2   | Shared contracts can be imported without circular dependencies | ✅ check-architecture green                                |
| 3   | Core does not depend on Claude Code APIs                       | ✅ enforced + gated                                        |
| 4   | CLI launches and displays help/version information             | ✅ smoke-tested                                            |
| 5   | Project profile validation has tests                           | ✅ 12 tests in contracts + 6 in core                       |
| 6   | CI runs tests, lint, typecheck and build                       | ✅ `.github/workflows/ci.yml`                              |
| 7   | A clean checkout can reproduce the successful build            | ✅ lockfile committed                                      |
| 8   | No placeholder package is presented as a working feature       | ✅ adapter is explicitly a boundary declaration (ADR-0005) |

## Architectural invariants (`docs/architecture/ARCHITECTURE.md` §6)

Enforced by `scripts/check-architecture.ts` and CI:

1. `contracts` imports nothing.
2. `core` imports only from `contracts`.
3. `cli` imports from `core` and `contracts`.
4. `testing` imports from `contracts` and dev-only deps.
5. `claude-code-adapter` imports from `contracts`; the host SDK import
   lives inside this package only.
6. No package imports from a sibling's `dist/`.

## What is NOT in 0.1 (intentionally)

Per `docs/product/PRODUCT.md` §4 and `docs/roadmap/ROADMAP.md` §25, M0+M1
explicitly does NOT ship:

- Repository discovery (M2).
- Skills, agents, slash commands, Mods, stack packs, patterns (M3+).
- The `/kit:feature` workflow (M7).
- The installer (M15).
- Real Claude Code host SDK integration (M10).

Their contract surfaces are declared in `docs/` and `packages/contracts/`
so that later milestones do not have to refactor the core.

## License

MIT. See `LICENSE`.

## Next steps

The roadmap recommends M2 (repository discovery) as the next milestone,
using `fixtures/fixture-node-fullstack/` as the first `kit inspect` target.
