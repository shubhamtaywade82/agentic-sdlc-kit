# Copilot Instructions
Follow the rules in the repository-root `AGENTS.md` (relative path, no leading slash) — source of truth. Key points:
- Match existing code patterns; small focused changes; tests with every logic change.
- Never introduce secrets, new deps without reason, or unrelated edits.
- In chat/agent mode: plan first, then implement, then run tests and report results.
- Pushing, merging, tagging, releasing, and deploying always require explicit human approval first.
