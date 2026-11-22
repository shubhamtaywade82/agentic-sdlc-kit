# fixture-ruby-rspec

A minimal but real plain-Ruby application with a passing RSpec suite. **The
second reference fixture for the Agentic SDLC Kit**, and the first that
exercises a non-JavaScript stack end to end (`bundle exec rspec`).

## Why this fixture exists

The kit's acceptance criteria require validating against an actual existing
application, not a toy repository (`docs/roadmap/ROADMAP.md` §9, M7
acceptance test). The Node fixture covers the `node-typescript` stack; this
fixture covers the `ruby` stack pack — a plain Ruby project tested with
RSpec and linted with RuboCop. It has business logic, an entry point, a
passing test suite, existing conventions, and a `.ai-kit/project.yml` that
matches what `kit init` produces.

It exists primarily so the kit's evidence gate is exercised against a **real
`bundle exec rspec` run in CI** — proving the verification classifier
recognizes RSpec's `Failure/Error:` blocks and `N examples, M failures`
summary line as a Red-phase assertion failure (ADR-0018 P1).

## Layout

```
fixture-ruby-rspec/
├── lib/
│   └── widget.rb          # Widget value object with a constructor validation
├── spec/
│   ├── spec_helper.rb     # RSpec config; adds lib/ to $LOAD_PATH
│   └── widget_spec.rb     # 3 passing examples using RSpec
├── docs/
│   └── NOTES.md           # engineering notes (existing convention)
├── .ai-kit/
│   └── project.yml        # the profile `kit init` produces
├── AGENTS.md              # existing agent instruction file
├── Gemfile                # rspec ~> 3.13 only
├── Rakefile               # `rake spec`
├── .rspec                 # --format documentation --color
└── README.md (this file)
```

## Running the fixture (standalone)

```bash
cd fixtures/fixture-ruby-rspec
bundle install            # installs rspec (cached in CI via bundler cache)
bundle exec rspec         # runs the 3 examples
```

The fixture has a single dependency (`rspec`) and no database, so the suite
boots in milliseconds.

## What the kit does with this fixture

- **M2 `kit inspect`**: scans the fixture read-only, detects the `ruby`
  stack (Gemfile + `gem 'rspec'` + a `spec/` directory), produces a
  `RepositoryScan` and a proposed `ProjectProfile`. The scan must NOT
  modify any file in the fixture.
- **Feature workflow / Tier C conformance**: a feature run drives the TDD
  phase cycle (`kit feature <id> red|green|refactor <task>`). The task's
  verification command is `bundle exec rspec`; the evidence gate classifies
  a failing RSpec run as `assertion` (Red) and a passing run as `Green`.

## Adversarial extensions (M17)

Later milestones extend this fixture with deliberately injected failures
(failing specs, dirty git state, secret-containing files, destructive
commands). For now the fixture is clean and is the **target** of inspection
and the TDD cycle.

## License

MIT, same as the kit.
