# AGENTS.md — Ruby on Rails

> Source of truth for all AI assistants in this repo. Keep it short, accurate, current.
> Lines marked `# ADJUST` are defaults — change them to match your app.

## 1. Project Context
- **Product:** <one-line description>   # ADJUST
- **Stack:** Ruby 3.4, Rails 8.x, PostgreSQL 16, Hotwire (Turbo + Stimulus), Tailwind CSS,
  Propshaft + importmap, Solid Queue (jobs), Solid Cache, Solid Cable, Kamal deploy   # ADJUST
- **Testing:** RSpec + FactoryBot + Shoulda Matchers + Capybara (system specs), WebMock/VCR,
  SimpleCov   # ADJUST (if you use Minitest, swap `bin/rspec` for `bin/rails test`)
- **Key dirs:** `app/models`, `app/controllers`, `app/views`, `app/components` (ViewComponent),
  `app/services`, `app/jobs`, `app/policies`, `app/javascript/controllers`, `db/migrate`, `spec/`

### Commands
| Task | Command |
|---|---|
| Setup | `bin/setup` |
| Dev server | `bin/dev` |
| Console | `bin/rails console` |
| All tests | `bundle exec rspec` |
| One file / line | `bundle exec rspec spec/models/user_spec.rb:42` |
| System specs | `bundle exec rspec spec/system` |
| Lint | `bin/rubocop` (autofix: `bin/rubocop -a`) |
| Security scan | `bin/brakeman --no-pager` and `bundle exec bundler-audit check --update` |
| ERB lint | `bundle exec erb_lint --lint-all`   # ADJUST |
| Migrate | `bin/rails db:migrate` (then commit `db/schema.rb`) |
| Rollback check | `bin/rails db:migrate:redo` |
| Routes | `bin/rails routes -g <pattern>` |

### Do not touch
`db/schema.rb` by hand, `config/credentials*.yml.enc`, `config/master.key`, `.env*`,
`vendor/`, `public/assets/`, `tmp/`, `log/`, `storage/`, `.kamal/secrets`.

## 2. Operating Principles
1. Read related models, controllers, specs, and `config/routes.rb` before editing. Search, don't guess.
2. Ask up to 3 focused questions when requirements are ambiguous, then proceed with stated assumptions.
3. Plan first for anything > 1 file or > 50 lines; save it to `docs/plans/<slug>.md`.
4. One logical change per commit; keep diffs reviewable.
5. Test-first for logic. Bug fix = failing regression spec first.
6. Run specs + RuboCop and show output before claiming done.
7. Follow existing app patterns over personal preference. Use Rails conventions before adding gems.
8. No silent scope creep — log unrelated issues in `docs/TODO.md`.

## 3. Rails Conventions
**Architecture**
- Follow "The Rails Way": RESTful resources, the 7 standard actions; add a new controller
  instead of custom actions (e.g. `Posts::PublicationsController#create`, not `PostsController#publish`).
- Thin controllers: params → authorize → call model/service → render/redirect.
- Domain logic in models and concerns first; extract a PORO in `app/services/` (or `app/models/`)
  only when logic spans multiple models or external systems. Service API: `.call` returning a result.
- No business logic in views, helpers, or callbacks with side effects (emails, API calls) — use jobs.
- Use `ActiveSupport::CurrentAttributes` sparingly; never for passing data that should be an argument.

**Models & ActiveRecord**
- Validate at both layers: model validations + DB constraints (`null: false`, FKs, unique indexes).
- Prevent N+1: `includes`/`preload`; use `strict_loading` where helpful. Bullet in dev.   # ADJUST
- Use scopes for reusable queries; `find_each` for batches; `pluck`/`select` when you don't need objects.
- Wrap multi-record writes in `transaction`. Use `!` methods inside transactions so failures raise.
- Enums: `enum :status, { draft: 0, published: 1 }, validate: true` with an integer column + default.
- Never interpolate into SQL; use bound params or Arel.

**Migrations**
- Always reversible (`change` or `up`/`down`). Add indexes for every FK and query pattern.
- Zero-downtime safe: add column nullable → backfill in a job → add constraint; add indexes
  with `algorithm: :concurrently` + `disable_ddl_transaction!` on large tables. strong_migrations gem.   # ADJUST
- Never edit a migration that has run on shared environments; write a new one.
- No model classes inside migrations (define a minimal inline class if you must).

**Controllers & Security**
- Strong params with `params.expect(...)` (Rails 8) or `require/permit`.
- Authorize every action (Pundit `authorize` / `policy_scope`, deny by default).   # ADJUST
- Use built-in CSRF protection; never `skip_forgery_protection` on cookie-auth endpoints.
- Rate-limit sensitive endpoints with `rate_limit to:, within:` (Rails 8).
- Secrets only via `Rails.application.credentials` or ENV. Filter sensitive params in logs.
- Output escaped by default — never `html_safe`/`raw` on user input; use `sanitize` if needed.

**Views & Frontend**
- Hotwire first: Turbo Frames/Streams for partial updates; Stimulus for small JS behaviors.
- Partials/ViewComponents for reuse; keep logic out of ERB. Use `dom_id` for Turbo targets.
- Stimulus controllers: one responsibility, `data-*-target`/`-value` APIs, no global state.

**Jobs**
- Idempotent and retry-safe; pass IDs, not objects. Set `retry_on`/`discard_on` explicitly.
- Use `deliver_later` for mail. Long work never runs in the request cycle.

**Style**
- RuboCop (rubocop-rails-omakase or project config) is law; no disabling cops without a comment.
- `frozen_string_literal: true` where the project uses it. Prefer guard clauses; methods < 15 lines.
- Use Ruby 3 idioms: keyword args, pattern matching where clearer, `then`, endless methods sparingly.

## 4. Testing (RSpec)
- Layers: model specs (validations, scopes, methods) → request specs (HTTP contracts, auth) →
  system specs (critical user journeys only). Avoid controller specs; prefer request specs.
- FactoryBot: minimal valid factories; traits for variants; `build`/`build_stubbed` over `create` when possible.
- Every authorization rule has a passing and a failing spec.
- Stub external HTTP with WebMock/VCR. Freeze time with `travel_to`. Jobs: `have_enqueued_job`,
  `perform_enqueued_jobs`. Mail: `have_enqueued_mail`.
- `describe` the method/endpoint, `context` the condition ("when user is admin"), `it` the outcome.
- Keep the suite fast: no `sleep`; use Capybara's waiting matchers.

## 5. Git & PRs
- Branches: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Conventional commits: `feat(billing): add invoice PDF`.
- Migrations and `db/schema.rb` committed together, in their own commit when possible.
- PR uses `.ai/templates/PR.md` with spec output and any migration notes.

## 6. Safety Boundaries (need explicit human approval)
- Pushing any branch, merging a PR, pushing to `main`, force-push, history rewrite.
- Creating/pushing git tags, publishing releases, and deploying (`kamal deploy`) — each one individually.
- `db:drop`, `db:reset`, `db:schema:load`, or any migration/rake task against non-local DBs.
- `bin/rails credentials:edit`, reading/printing `master.key` or `.env`.
- `kamal deploy`, editing `config/deploy.yml`, CI workflows, or Dockerfile.
- Adding gems (state why: maintenance, size, license) or upgrading Rails/Ruby.

## 7. Definition of Done
- [ ] `bundle exec rspec` green; new code has specs
- [ ] `bin/rubocop` clean; `bin/brakeman` no new warnings
- [ ] Migrations reversible; schema committed; indexes added
- [ ] No N+1 introduced (checked in logs/Bullet)
- [ ] Authorization covered; strong params updated
- [ ] Docs/CHANGELOG updated; plan checkboxes ticked

## 8. Report Format
1. What changed (files + one line each)  2. Verification (commands + results)
3. Assumptions  4. Follow-ups / risks

## Kit integration
- Pattern implementations for this stack: `.ai/stack/patterns/` (see its README).
  Selection policy first: the `design-pattern-selection` skill's five questions.
- Quality gates for this stack live in `.ai/project.yml` (`quality.commands`) —
  keep them aligned with the Commands section above so `kit verify` matches
  the documented workflow. Run `node .ai/kit/bin/kit.js init` to (re)generate.
