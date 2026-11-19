# Fixtures

Reference repositories the kit validates itself against.

## Current

| Fixture                  | Purpose                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `fixture-node-fullstack` | Existing Node.js + TypeScript + Express-style app with passing tests. M2 `kit inspect` target. |

## Planned (per `docs/testing/TESTING.md` §7 and `docs/roadmap/ROADMAP.md` §23)

| Fixture             | Purpose                                                              | Milestone |
| ------------------- | -------------------------------------------------------------------- | --------- |
| `fixture-rails-api` | Existing Rails API with models, services, migrations, RSpec          | M2 (later)|
| `fixture-greenfield`| Empty or minimal repo for new app creation                           | M8        |

Later milestones extend each fixture with deliberately injected failures
(failing tests, dirty git state, secret-containing files, destructive
commands, interrupted runs, circular task dependencies). This makes the
fixtures acceptance environments rather than showcase examples.
