# Fixtures

Reference repositories the kit validates itself against.

## Current

| Fixture                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `fixture-node-fullstack` | Existing Node.js + TypeScript + Express-style app with passing tests. M2 `kit inspect` target. |
| `fixture-ruby-rspec`     | Existing plain-Ruby app with a passing RSpec suite. Exercises `bundle exec rspec` and the RSpec/Minitest failure classifier end to end. |

## Planned (per `docs/testing/TESTING.md` §7 and `docs/roadmap/ROADMAP.md` §23)

| Fixture              | Purpose                                                     | Milestone  |
| -------------------- | ----------------------------------------------------------- | ---------- |
| `fixture-rails-api`  | Existing Rails API with models, services, migrations, RSpec | M2 (later) |
| `fixture-greenfield` | Empty or minimal repo for new app creation                  | M8         |

The verification classifier already recognizes RSpec and Minitest failure
output (see `packages/core/src/verification/classification.ts`), so the
`ruby-rails` stack pack's evidence gate is functional. The Rails fixture
itself remains planned because a bootable Rails API app requires a
database, migrations, and `rails new`-generated boilerplate best produced
where Rails can run.

Later milestones extend each fixture with deliberately injected failures
(failing tests, dirty git state, secret-containing files, destructive
commands, interrupted runs, circular task dependencies). This makes the
fixtures acceptance environments rather than showcase examples.
