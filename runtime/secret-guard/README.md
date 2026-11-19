# secret-guard

Secret detection on the way INTO the repository (Claude Code mod). v1 scope:
write + commit scanning. All registrations chain `.catch(...)` — internal
errors refuse the write/commit (fail closed).

| Hook | Scope |
| --- | --- |
| `tool.call` `{tool:['Write','NotebookEdit']}` | Scan the full new content (`e.content` / `e.new_source`) |
| `tool.call` `{tool:'Edit'}` | Scan only `e.new_string` — the text that actually lands |
| `tool.call` `{tool:'Bash'}` | For `git commit` (incl. `--amend` / compound commands): scan the staged diff (`git diff --cached`) BEFORE the commit runs. If the diff cannot be read, the commit is refused (fail closed). |

Additionally, writing production-flavored env files
(`.env.production`, `.env.live`, `.env.prod` and suffixed variants) asks for
explicit confirmation — prod env files rarely belong in repositories.

The staged diff itself is deliberately never echoed to the model; deny
messages contain pattern ids and line numbers only. Finding previews are the
first 6 characters of the match plus an ellipsis — never the full secret.

## Canonical pattern list (shared spec with the kit CLI — keep in sync)

| id | pattern |
| --- | --- |
| `aws-access-key-id` | `\bAKIA[0-9A-Z]{16}\b` |
| `private-key-block` | `-----BEGIN [A-Z ]*PRIVATE KEY-----` |
| `github-token` | `\bgh[pousr]_[A-Za-z0-9]{36,255}\b` |
| `gitlab-token` | `\bglpat-[0-9A-Za-z_-]{20,}\b` |
| `slack-token` | `\bxox[baprs]-[0-9A-Za-z-]{10,}\b` |
| `stripe-key` | `\b(sk\|pk)_(live\|test)_[0-9A-Za-z]{24,}\b` |
| `google-api-key` | `\bAIza[0-9A-Za-z_-]{35}\b` |
| `openai-key` | `\bsk-[A-Za-z0-9_-]{20,}\b` (matches starting `sk_live_`/`sk_test_` are skipped) |
| `generic-assignment` | `\b(password\|passwd\|secret\|api[_-]?key\|auth[_-]?token\|access[_-]?token)\b['"]?\s*[:=]\s*['"][^'"\s]{16,}['"]` (case-insensitive) |

Placeholder **values** in generic assignments are ignored (`${VAR}`,
`{{var}}`, `<…>`, and values containing changeme/example/placeholder/dummy/
xxxxx/redacted/your), so `.env.example`-style templates don't fire.
Strictly-shaped tokens (`AKIA…`, `ghp_…`) are always findings — this is a
fail-closed detector. `redact()` masks full matches as `[REDACTED:<patternId>]`.

## Config keys read

None in v1 — secret-guard has no `.ai/project.yml` keys yet (the reader will
be vendored when config keys are added; see the shared profile contract in
`runtime/README.md`).

## Roadmap (not in v1)

- Tool-output redaction (post-turn-step redaction of results).
- `git push` checks and gitleaks integration as an external scanner.
- Custom detection rules from the project profile.

Detection coverage is explicitly best-effort: this is a tripwire for
agent-written files and commits, not a replacement for a pre-receive secret
scanner on the server.

## Tests

- `claude plugin test` in this directory (thin write-path integration tests).
- Policy tests: `npm test` in `runtime/` — every pattern with real-shaped
  samples, placeholder filtering, redaction, `sk_live_` disambiguation,
  prod-env path detection.
