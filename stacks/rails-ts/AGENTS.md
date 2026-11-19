# AGENTS.md — Rails + TypeScript Monolith

> Source of truth for all AI assistants in this repo. One app, one repo, two languages.
> Lines marked `# ADJUST` are defaults — change them to match your app.

## 1. Project Context
- **Product:** <one-line description>   # ADJUST
- **Backend:** Ruby 3.4, Rails 8.x, PostgreSQL 16, Solid Queue/Cache/Cable, Kamal deploy
- **Frontend:** TypeScript 5 (strict) built with Vite Ruby (`vite_rails`), React 19 components
  mounted in Rails views (or Inertia.js pages via `inertia_rails`), Tailwind CSS   # ADJUST
  (alternatives: jsbundling-rails + esbuild; Stimulus controllers written in TS; Vue/Svelte)
- **Server/client contract:** JSON endpoints under `/api` or Inertia props, serialized with
  Alba/serializers; TS types generated from them (types_from_serializers, or rswag +
  openapi-typescript); routes via js_from_routes   # ADJUST
- **Testing:** RSpec + FactoryBot + Capybara system specs (backend + end-to-end),
  Vitest + React Testing Library + MSW (frontend)   # ADJUST
- **Package manager:** pnpm   # ADJUST

### Where things live
| Area | Path |
|---|---|
| Models, controllers, jobs, policies | `app/models`, `app/controllers`, `app/jobs`, `app/policies` |
| Serializers (the API contract) | `app/serializers` |
| Rails views / layouts | `app/views` |
| TypeScript source (Vite root) | `app/frontend` (`entrypoints/`, `components/`, `pages/`, `lib/`, `api/`)   # ADJUST |
| Generated TS types / routes | `app/frontend/types/generated`, `app/frontend/api/generated` (never edit) |
| Backend specs | `spec/` (models, requests, system) |
| Frontend tests | `app/frontend/**/*.test.ts(x)` |

### Commands
| Task | Command |
|---|---|
| Setup | `bin/setup && pnpm install` |
| Dev (Rails + Vite) | `bin/dev` |
| Backend tests | `bundle exec rspec` (one: `bundle exec rspec spec/requests/orders_spec.rb:12`) |
| End-to-end | `bundle exec rspec spec/system` |
| Frontend tests | `pnpm test` (one: `pnpm vitest run app/frontend/components/Cart.test.tsx`) |
| Type-check | `pnpm typecheck` (`tsc --noEmit`) |
| Lint | `bin/rubocop` and `pnpm lint` |
| Format | `bin/rubocop -a` and `pnpm format` |
| Security | `bin/brakeman --no-pager`, `bundle exec bundler-audit check --update`, `pnpm audit` |
| Regenerate TS types | `pnpm gen:api` (wraps your generator: types_from_serializers, openapi-typescript, etc.)   # ADJUST |
| Migrate | `bin/rails db:migrate` (commit `db/schema.rb`) |
| **Verify everything** | `bin/ci` → runs all of the above in order   # ADJUST (create it if missing) |

### Do not touch
`db/schema.rb` by hand, generated TS files, `config/credentials*.yml.enc`, `config/master.key`,
`.env*`, `public/vite*/`, `node_modules/`, `tmp/`, `log/`, `storage/`, lockfiles by hand.

## 2. Operating Principles
1. Read both sides before editing: model → controller → serializer → TS types → component.
2. Ask up to 3 focused questions when requirements are ambiguous, then proceed with stated assumptions.
3. Plan first for anything > 1 file or > 50 lines; save it to `docs/plans/<slug>.md`.
4. One logical change per commit; keep diffs reviewable.
5. Test-first for logic, on whichever side the logic lives.
6. Before claiming done, run the checks for every side you touched (see Definition of Done).
7. Follow existing patterns. Use Rails conventions and the existing frontend approach before adding libraries.
8. No silent scope creep — log unrelated issues in `docs/TODO.md`.

## 3. Which Side Owns What
- **Rails owns:** data, business rules, validation, authentication, authorization, routing,
  background work, emails, and the first page render.
- **TypeScript owns:** interactivity, client-side state, optimistic UI, and form UX.
- Server-rendered HTML (ERB + Turbo/Stimulus) is the default. Reach for a React/TS component
  only when the UI is genuinely interactive (rich forms, drag-and-drop, live editors, charts).   # ADJUST
- Never duplicate business rules in TS. Client-side validation is for UX only; the server re-validates.
- Never rely on the frontend for permissions. Hide buttons for UX, but authorize in the controller.

## 4. Cross-Boundary Changes (backend → frontend)
Do these in order, one commit each where practical:
1. **Migration + model** with model specs.
2. **Controller + serializer** with request specs asserting status codes and JSON shape.
3. **Regenerate TS types/routes**; commit the generated files with the serializer change.
4. **Frontend** uses the generated types; tests with MSW mocks matching the request spec.
5. **System spec** for the full user journey if it's a critical path.
Renaming or removing a JSON field is a breaking change: update the serializer, regenerate types,
and fix every `tsc` error before committing.

## 5. Backend Conventions (Rails)
- RESTful resources and the 7 standard actions; add a controller rather than custom actions.
- Thin controllers: params → authorize → model/service → render. JSON via serializers only,
  never `render json: model` (leaks columns).
- Strong params with `params.expect(...)`. Authorize every action (Pundit, deny by default).   # ADJUST
- Validations + DB constraints; avoid N+1 with `includes`/`preload`.
- Migrations reversible and zero-downtime safe; index every FK and query pattern.
- Side effects in jobs (idempotent, pass IDs). `rate_limit` on sensitive endpoints.
- API errors: consistent shape `{ error: { code, message, details } }` with correct status codes.   # ADJUST

## 6. Frontend Conventions (TypeScript)
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any`, no `@ts-ignore`.
- Use generated types for every server payload. Validate anything not covered by generated
  types (e.g. third-party APIs, `localStorage`) with Zod.
- One API client module (`app/frontend/api/`) that sets `X-CSRF-Token` from
  `<meta name="csrf-token">`, sends `Accept: application/json`, and maps errors to typed results.
  Components never call `fetch` directly.
- Mount components from Rails views via a single mounting helper/entrypoint; pass initial data
  as serialized props (no extra fetch on first load). With Inertia, props come from the controller.
- Components small and typed (`type Props = {...}`); named exports; `@/` alias for imports.
- Accessibility: semantic HTML, labelled inputs, keyboard support, focus management.
- Keep bundles lean: one entrypoint per area, lazy-load heavy widgets.

## 7. Testing
- **Backend:** model specs for rules; request specs for every endpoint (auth pass/fail,
  validation errors, JSON shape). Stub external HTTP with WebMock; freeze time with `travel_to`.
- **Frontend:** Vitest + RTL, query by role/label; MSW handlers mirror real response shapes.
- **End-to-end:** Capybara system specs (JS driver) for critical journeys only; no `sleep`.   # ADJUST
- A bug at the boundary gets a test on both sides (request spec + component test).

## 8. Git & PRs
- Branches: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Conventional commits with scope:
  `feat(api): add order totals`, `feat(ui): show order totals`.
- Migrations + `db/schema.rb` together. Serializer change + regenerated types together.
- Gemfile.lock and pnpm-lock.yaml committed with their dependency changes.
- PR uses `.ai/templates/PR.md`; include backend and frontend test output and UI screenshots.

## 9. Safety Boundaries (need explicit human approval)
- Pushing any branch, merging a PR, pushing to `main`, force-push, history rewrite.
- Creating/pushing git tags, publishing releases, and deploying (`kamal deploy`) — each one individually.
- `db:drop`, `db:reset`, `db:schema:load`, or any migration/rake task against non-local DBs.
- Editing credentials or reading `master.key` / `.env*`.
- `kamal deploy`, editing `config/deploy.yml`, Dockerfile, CI workflows, or `vite.config.*` build output settings.
- Adding gems or npm packages (state why), or upgrading Rails, Ruby, React, Vite, or TypeScript.

## 10. Definition of Done
- [ ] Backend touched → `bundle exec rspec`, `bin/rubocop`, `bin/brakeman` clean
- [ ] Frontend touched → `pnpm typecheck`, `pnpm lint`, `pnpm test` clean
- [ ] Contract touched → types regenerated and committed; `pnpm typecheck` clean
- [ ] Critical journey touched → system spec green
- [ ] Authorization on server; strong params updated; no N+1
- [ ] Loading, error, and empty states handled in the UI
- [ ] Docs/CHANGELOG updated; plan checkboxes ticked

## 11. Report Format
1. What changed (files + one line each, grouped backend/frontend)  2. Verification (commands + results)
3. Assumptions  4. Follow-ups / risks

## Kit integration
- Pattern implementations for this stack: `.ai/stack/patterns/` (see its README).
  Selection policy first: the `design-pattern-selection` skill's five questions.
- Quality gates for this stack live in `.ai/project.yml` (`quality.commands`) —
  keep them aligned with the Commands section above so `kit verify` matches
  the documented workflow. Run `node .ai/kit/bin/kit.js init` to (re)generate.
