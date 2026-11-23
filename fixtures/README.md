# Fixtures

Reference repositories the kit validates itself against.

## Current

| Fixture                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `fixture-node-fullstack` | Existing Node.js + TypeScript + Express-style app with passing tests. M2 `kit inspect` target. |
| `fixture-ruby-rspec`     | Existing plain-Ruby app with a passing RSpec suite. Exercises `bundle exec rspec` and the RSpec/Minitest failure classifier end to end. |
| `fixture-rails-api`      | Existing Rails 8 API app with a passing rspec-rails suite. Exercises `bundle exec rails db:prepare` + `bundle exec rspec` inside a booted Rails environment. |
| `fixture-react-spa`      | Existing React 19 + Vite 8 + TypeScript SPA with vitest/RTL component tests and Playwright e2e. Exercises the `react-typescript` pack and the kit's first real browser CI lane. |

## Planned (per `docs/testing/TESTING.md` §7 and `docs/roadmap/ROADMAP.md` §23)

| Fixture              | Purpose                                        | Milestone  |
| -------------------- | ---------------------------------------------- | ---------- |
| `fixture-greenfield` | Empty or minimal repo for new app creation     | M8         |

Later milestones extend each fixture with deliberately injected failures
(failing tests, dirty git state, secret-containing files, destructive
commands, interrupted runs, circular task dependencies). This makes the
fixtures acceptance environments rather than showcase examples.
