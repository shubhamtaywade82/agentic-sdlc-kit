---
name: security-engineering
description: Threat-aware secure implementation — input validation, auth boundaries, secrets, dependencies. Use when code touches auth, input handling, files, SQL, payments, or dependencies, when handling secrets or .env files, or when running kit audit.
license: MIT
---

# Security Engineering

Security is a design input, not a final pass. Work the threats for the surface
you touch; delegate the rest to the checklist.

## Threat notes (lightweight, per change)

For any touched surface, name: who can reach it (trust boundary), what they
control (inputs), what could go wrong (top 3: injection, authz bypass, data
leak), and the mitigation in the design. Ten lines in the spec's security
section beat a 40-page report nobody reads.

## Implementation rules

- **Validate all external input** at the boundary; parameterize every query;
  escape on output. No string-built SQL, ever.
- **Authz is per-request**: check the caller's right to THIS object, not just
  their session. Object-level checks live next to the data access, not in the UI.
- **Secrets never live in code or logs** — environment/secret manager only.
  `.env*` files are local; production env files stay out of the repo.
  Run `node .ai/kit/bin/kit.js audit` before every release and after adding
  dependencies.
- **Fail closed**: on error, deny and log — never open a fallback path.
- **Least privilege**: the service account, the token scope, the file
  permission — the smallest that works.
- **Dependencies are attack surface**: pin versions, justify additions, note
  maintenance + license in the PR; `kit audit` surfaces known advisories.

## Review focus (diff-time)

`checklists/security.md` when the diff touches: auth/session handling, input
parsing, file paths or uploads, SQL/ORM queries, external HTTP calls,
serialization, permissions, crypto (don't roll your own), or dependency files.

Look for: injection (SQL/command/path/template), broken authz (missing
object-level checks), SSRF (user-controlled URLs), insecure deserialization,
secrets in code/logs/tests, overly broad CORS/permissions, error messages that
leak internals.

## Escalation

A suspected vulnerability in existing code: do not exploit it further — write
it up (location, impact, suggested fix) to `docs/security/` and flag it as a
Blocker in review. Critical finding unresolved at release time blocks the
release, or gets an explicit, documented waiver from a human.
