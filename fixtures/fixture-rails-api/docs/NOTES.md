# Engineering notes — fixture-rails-api

This file documents existing engineering conventions in the fixture. It
exists so the kit's M2 discovery can demonstrate that it preserves existing
documentation rather than overwriting it.

## Public surface

| Model  | Validation                       | Table     |
| ------ | -------------------------------- | --------- |
| Widget | `validates :name, presence: true` | `widgets` |

## Decisions

- Rails 8.0 API-only (`config.api_only = true`); controllers inherit
  `ActionController::API`.
- SQLite via the `sqlite3 ~> 2.1` gem; databases under `storage/` (Rails 8
  convention). Native gem ships precompiled binaries, so no `libsqlite3-dev`
  build step is required in CI.
- Lean railties: only `active_record`, `action_controller`, `action_view`,
  `active_model` are required in `config/application.rb`. No
  `active_storage` / `action_cable` / `action_mailer` → no `storage.yml` or
  cable/mailer config needed.
- `db/schema.rb` mirrors the single migration; `bin/rails db:prepare`
  loads it so `maintain_test_schema!` in `rails_helper.rb` passes.
- rspec-rails `~> 8.0`; `use_transactional_fixtures = true` (each spec runs
  in a rolled-back transaction; the `widgets` table must exist but stays
  empty between examples).
