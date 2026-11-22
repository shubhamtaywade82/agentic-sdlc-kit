# AGENTS.md — fixture-rails-api

This file exists so the kit's M2 discovery can find and respect an existing
agent instruction file in the target repository.

## Conventions

- Rails 8 API-only application (`config.api_only = true`).
- SQLite database stored under `storage/`.
- Tests use RSpec via rspec-rails; run with `bundle exec rspec`.
- Always run `bin/rails db:prepare` (or `db:schema:load`) before the suite.
- One model per file under `app/models/`; one spec per model under
  `spec/models/`.
- Business rules live on the models (validations, service objects when
  needed); controllers stay thin.

## What an AI assistant working in this repository should do

- Follow the conventions above.
- Add a model spec (or request spec) for any new behavior.
- Run `bin/rails db:prepare` and `bundle exec rspec` before claiming done.
- Do not add gems unless absolutely necessary; keep the fixture lean.
- Do not modify the Gemfile or database.yml without explicit approval.
