# `.ai/project.yml` — reference profile

`kit init` generates this; edit freely — `kit` validates it strictly (unknown
top-level keys and invalid values are errors with line numbers). Full schema:
`docs/architecture/contracts/project-profile.md` (in the kit repo).

```yaml
version: 1

project:
  name: my-app
  mode: existing            # existing | greenfield

stack:                      # all optional; discovered by kit init
  backend:
    language: typescript
    framework: express
  frontend:
    language: typescript
    framework: react
  database:
    primary: postgresql

architecture:
  style: modular-monolith

quality:
  commands:                 # ordered gates run by `kit verify` (arg arrays, shell:false)
    typecheck:
      - npm
      - run
      - typecheck
    lint:
      - npm
      - run
      - lint
    unit:
      - npm
      - test
    build:
      - npm
      - run
      - build
  timeoutSeconds: 600
  stopOnFailure: true

policies:
  tdd: required
  approvals:
    migrations: required    # sdlc-guard mod asks before migration commands
    deployment: required    # ... and before deploy/publish commands
    forcePush: prohibited   # the only allowed value
  protectedPaths: []        # extra write-protected globs (guard mod)

guard:                      # defaults shown; union with policies.protectedPaths
  protectedPaths:
    - .github/workflows/**
    - .git/**
    - .env
    - .env.*
    - "*.pem"
    - "*.key"

router:                     # model-router mod (Claude Code, optional)
  enabled: true
  main: {}                  # e.g. { model: sonnet } to pin the main conversation
  agents:
    repository-analyst:
      model: haiku
      effort: medium
    code-reviewer:
      model: inherit        # keep engine default for model, raise effort
      effort: high
    architecture-reviewer:
      effort: high
    security-reviewer:
      effort: high

observer:                   # run-observer mod
  enabled: true
```
