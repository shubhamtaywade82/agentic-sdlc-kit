# REQUIREMENTS.md — Agentic SDLC Kit

Status: M0 frozen. Functional and non-functional requirements for the
**0.1 release (M0 + M1)**. Later milestones add requirements through ADRs.

The keywords "MUST", "MUST NOT", "SHOULD", and "MAY" in this document follow
RFC 2119.

## 1. Functional requirements

### FR-1 Monorepo foundation

| ID     | Requirement                                                                                          | Milestone |
| ------ | ---------------------------------------------------------------------------------------------------- | --------- |
| FR-1.1 | The kit MUST be delivered as a pnpm-workspace TypeScript monorepo.                                  | M1-01     |
| FR-1.2 | Every workspace package MUST build with a single shared TypeScript compiler configuration.          | M1-02     |
| FR-1.3 | The kit MUST provide a `contracts` package with shared types and zod schemas.                        | M1-03     |
| FR-1.4 | The kit MUST provide a `core` package whose public surface depends on no runtime-specific API.       | M1-04     |
| FR-1.5 | The kit MUST provide a `cli` package that launches and prints help and version.                      | M1-05     |
| FR-1.6 | The kit MUST provide a `testing` package with shared fixtures, assertions, validators, and helpers.  | M1-06     |
| FR-1.7 | The kit MUST provide a `claude-code-adapter` package that is the architectural boundary for runtime. | M1-04     |

### FR-2 Contracts

| ID     | Requirement                                                                                              | Milestone |
| ------ | -------------------------------------------------------------------------------------------------------- | --------- |
| FR-2.1 | The contracts package MUST define a versioned `ProjectProfile` schema with `schemaVersion`, `name`, `stack`, and `commands`. | M1-07 |
| FR-2.2 | The contracts package MUST define `WorkflowMode`, `WorkflowStatus`, `CheckStatus` unions.               | M1-03     |
| FR-2.3 | The contracts package MUST define `VerificationReport` with runId, status, and checks.                  | M1-03     |
| FR-2.4 | The contracts package MUST define `Result<T, E>` and `KitError` error conventions.                      | M1-08     |
| FR-2.5 | The contracts package MUST NOT import from `core`, `cli`, or any adapter.                               | M1-03     |

### FR-3 CLI

| ID     | Requirement                                                                                          | Milestone |
| ------ | ---------------------------------------------------------------------------------------------------- | --------- |
| FR-3.1 | `kit --version` MUST print the package version.                                                     | M1-05     |
| FR-3.2 | `kit --help` MUST list the available commands.                                                       | M1-05     |
| FR-3.3 | Unknown commands MUST exit non-zero with a helpful message.                                          | M1-05     |
| FR-3.4 | The CLI MUST be structured so that future commands (`init`, `inspect`, `doctor`, `verify`, …) can be added without rewriting the dispatcher. | M1-05 |

### FR-4 Quality gates

| ID     | Requirement                                                                                          | Milestone |
| ------ | ---------------------------------------------------------------------------------------------------- | --------- |
| FR-4.1 | The root `package.json` MUST expose `typecheck`, `lint`, `test`, `build`, and `verify` scripts.     | M1-09     |
| FR-4.2 | `pnpm verify` MUST run typecheck, lint, test, and build in that order and fail on the first error. | M1-09     |
| FR-4.3 | CI MUST run `pnpm verify` on every pull request.                                                    | M1-11     |

### FR-5 Documentation

| ID     | Requirement                                                                                          | Milestone |
| ------ | ---------------------------------------------------------------------------------------------------- | --------- |
| FR-5.1 | The kit MUST ship the M0 artifact set: PRODUCT, REQUIREMENTS, ARCHITECTURE, MODULES, WORKFLOWS, CONTRACTS, SECURITY, TESTING, ROADMAP. | M0 |
| FR-5.2 | Every frozen decision in `PRODUCT.md` §6 MUST have a corresponding ADR.                              | M0        |
| FR-5.3 | The README MUST describe how to install, verify, and contribute.                                    | M1-10     |

### FR-6 Reference fixture

| ID     | Requirement                                                                                          | Milestone |
| ------ | ---------------------------------------------------------------------------------------------------- | --------- |
| FR-6.1 | The kit MUST ship a `fixture-node-fullstack` repository with Node.js + TypeScript + Express, a passing test, and a real project structure. | M0/M1 |
| FR-6.2 | The fixture MUST be usable as the target of a future M2 `kit inspect` dry-run without modifying it. | M0/M1 |

## 2. Non-functional requirements

### NFR-1 Runtime independence

| ID       | Requirement                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-1.1  | `core` MUST NOT import any symbol from `@anthropic-ai/*`, Claude Code APIs, or the `claude-code-adapter` package. |
| NFR-1.2  | The `contracts` package MUST be the only package other packages may import from without restriction.       |
| NFR-1.3  | `core` MAY be consumed by any future runtime adapter without code changes.                                |

### NFR-2 Build reproducibility

| ID       | Requirement                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-2.1  | A clean checkout (`pnpm install && pnpm verify`) MUST reproduce a successful build on Node 20 and Node 22.|
| NFR-2.2  | The lockfile `pnpm-lock.yaml` MUST be committed.                                                          |
| NFR-2.3  | Build output is deterministic given the same source; no timestamps or random IDs in emitted declarations.|

### NFR-3 Type safety

| ID       | Requirement                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-3.1  | All packages MUST compile under `strict: true`.                                                            |
| NFR-3.2  | `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, and `noUnusedParameters` MUST be on.  |
| NFR-3.3  | Runtime schemas (zod) MUST be structurally compatible with the exported TypeScript types.                  |

### NFR-4 Security posture (M0 baseline)

| ID       | Requirement                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-4.1  | The kit MUST NOT execute any project-discovered script merely to determine what it does (deferred to M2). |
| NFR-4.2  | The kit MUST NOT silently overwrite existing configuration files.                                          |
| NFR-4.3  | The kit MUST NOT commit or print secret values in any artifact it produces.                                |
| NFR-4.4  | Destructive operations (file delete, force push, migration, deploy) MUST require explicit approval.       |

### NFR-5 No false assurance

| ID       | Requirement                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-5.1  | A skipped verification check MUST NOT be counted as `passed`.                                              |
| NFR-5.2  | A scanner failure MUST be reported as a failure, not as a clean result.                                    |
| NFR-5.3  | A denied approval MUST NOT be silently turned into an approval by any later stage.                         |

### NFR-6 Maintainability

| ID       | Requirement                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-6.1  | No workspace package MAY export a placeholder symbol presented as a working feature.                       |
| NFR-6.2  | The root instruction file (README) MUST stay short; procedures belong in Skills (M3+) and ADRs.            |
| NFR-6.3  | Every public API in `contracts` MUST be covered by at least one unit test.                                |

## 3. Out of scope for 0.1

Everything from M2 onward. Specifically: repository discovery, requirements
engineering, planning, TDD implementation, verification execution, the
`/kit:feature` workflow, Mods, stack packs, installer, and ecosystem
integrations. These are listed in `ROADMAP.md` and are intentionally **not**
required by this requirements document.

## 4. Traceability

Every requirement above is mapped to a milestone task ID. The M1 acceptance
criteria in `ROADMAP.md` §3.2 are derived from this document. Test cases
that prove these requirements live under `packages/*/src/**/*.test.ts` and are
enumerated in `TESTING.md`.
