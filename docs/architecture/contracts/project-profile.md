# Contract: Project Profile (`.ai/project.yml`)

Owner: `kit` CLI (`kit init` writes it; every command reads it). Mods read a
tolerant subset (unknown keys ignored, safe defaults on any parse failure —
the CLI is strict, the runtime is forgiving, by design: humans hand-edit this
file and mods must survive schema evolution).

YAML subset (enforced by `kit`): 2-space nested maps, `- item` sequences,
plain/quoted string scalars, booleans, integers, comments. No anchors, flow
style, block scalars, or multi-doc — the parser rejects them with line
numbers.

## Schema (version 1)

```yaml
version: 1                        # required; must be 1

project:
  name: string                    # required
  mode: existing | greenfield     # required

stack:                            # optional, all subkeys optional
  backend:  { language: string, framework: string }
  frontend: { language: string, framework: string }
  database: { primary: string }

architecture:
  style: string                   # free-form: modular-monolith, layered, ...

quality:
  commands:                       # ORDERED map: gate id -> argv array
    typecheck: [npm, run, typecheck]
    lint:      [npm, run, lint]
    unit:      [npm, test]
    integration: [npm, run, test:integration]
    e2e:       [npm, run, test:e2]
    build:     [npm, run, build]
  timeoutSeconds: 600             # per command, default 600
  stopOnFailure: true             # false / --keep-going: run everything

policies:
  tdd: required | optional                     # default optional
  approvals:
    migrations: required | not-required        # default required
    deployment: required | not-required        # default required
    forcePush: prohibited                      # the ONLY legal value
  protectedPaths: []              # extra globs, unioned with guard.protectedPaths

guard:                            # consumed by the sdlc-guard mod
  protectedPaths:                 # defaults shown
    - .github/workflows/**
    - .git/**
    - .env
    - .env.*
    - "*.pem"
    - "*.key"

router:                           # consumed by the model-router mod
  enabled: false                  # default false — routing is opt-in
  main: { model: string }         # optional; pins the MAIN conversation model
  agents:                         # per-subagent overrides
    code-reviewer: { model: inherit | string, effort: low | medium | high }

observer:                         # consumed by the run-observer mod
  enabled: true
```

## Rules

- Command values MUST be non-empty arrays of non-empty strings — they are
  executed as `spawn(file, args, {shell:false})`, never via a shell string.
- `forcePush` rejects every value except `prohibited` (there is no "allowed").
- Unknown top-level keys are errors (CLI) / ignored (mods).
- Effective guard paths = `guard.protectedPaths` ∪ `policies.protectedPaths`.

## Consumers

| Consumer | Reads | Behavior when absent/invalid |
|---|---|---|
| `kit verify` | `quality.*` | exit 3: "run kit init" |
| `kit release-check` | `quality` evidence + git | version from package.json/CHANGELOG |
| sdlc-guard | `policies.approvals`, guard paths | fail-closed defaults (deny force-push, protect default paths) |
| model-router | `router.*` | fully pass-through |
| secret-guard | nothing (pattern canon is built in) | — |
| run-observer | `observer.enabled` | enabled (observer default) |
