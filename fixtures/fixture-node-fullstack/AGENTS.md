# AGENTS.md — fixture-node-fullstack

This file exists so the kit's M2 discovery can find and respect an existing
agent instruction file in the target repository.

## Conventions

- Plain Node.js; no framework. HTTP via `node:http`.
- Tests use `node:test`; run with `node --test`.
- No build step.
- JSON responses are sent with `content-type: application/json`.
- Endpoints return 404 for unknown routes.

## What an AI assistant working in this repository should do

- Follow the conventions above.
- Add a test for any new endpoint.
- Do not add dependencies unless absolutely necessary.
- Do not modify `package.json` scripts without explicit approval.
