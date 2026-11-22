# AGENTS.md — fixture-ruby-rspec

This file exists so the kit's M2 discovery can find and respect an existing
agent instruction file in the target repository.

## Conventions

- Plain Ruby; no Rails, no web framework.
- Tests use RSpec; run with `bundle exec rspec`.
- No build step. No database.
- Constructor validations raise `ArgumentError`.
- One class per file under `lib/`; one spec per class under `spec/`.

## What an AI assistant working in this repository should do

- Follow the conventions above.
- Add an RSpec example for any new behavior.
- Keep the fixture dependency-light: do not add gems unless absolutely necessary.
- Do not modify the Gemfile without explicit approval.
