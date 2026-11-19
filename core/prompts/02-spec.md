# Prompt: PRD → Tech Spec

Read docs/product/<slug>.md and explore the codebase for related code (models, routes,
services, similar features). List the files you read.

Write docs/specifications/technical/<slug>.md using templates/TECH_SPEC.md. Requirements:
- Reuse existing patterns; cite the files you're imitating.
- For each significant decision give 2–3 options with trade-offs and a recommendation.
- Cover data model, API contracts (request/response examples), failure modes,
  security, performance, migration & rollback, observability, and test strategy.
- Flag anything requiring an ADR.
Do not write implementation code.
