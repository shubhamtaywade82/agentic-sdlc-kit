# Contract: Secret Detection Patterns (canonical)

Two independent implementations must stay behaviorally identical: the `kit`
CLI (`kit audit`, cli/src/secrets.ts) and the `secret-guard` Claude Code mod
(runtime/secret-guard/policies/detect.ts). Plugins must be self-contained
(source cannot be shared at runtime), so this document is the single source
of truth; both test suites validate against it.

## Pattern table

| id | Regex | Notes |
|---|---|---|
| `aws-access-key-id` | `\bAKIA[0-9A-Z]{16}\b` | |
| `private-key-block` | `-----BEGIN [A-Z ]*PRIVATE KEY-----` | any key type |
| `github-token` | `\bgh[pousr]_[A-Za-z0-9]{36,255}\b` | |
| `gitlab-token` | `\bglpat-[0-9A-Za-z_-]{20,}\b` | |
| `slack-token` | `\bxox[baprs]-[0-9A-Za-z-]{10,}\b` | |
| `stripe-key` | `\b(sk\|pk)_(live\|test)_[0-9A-Za-z]{24,}\b` | |
| `google-api-key` | `\bAIza[0-9A-Za-z_-]{35}\b` | |
| `openai-key` | `\bsk-[A-Za-z0-9_-]{20,}\b` | EXCLUDE matches starting `sk_live_` / `sk_test_` (stripe) |
| `generic-assignment` | `\b(password\|passwd\|secret\|api[_-]?key\|auth[_-]?token\|access[_-]?token)\b['"]?\s*[:=]\s*['"][^'"\s]{16,}['"]` (case-insensitive) | placeholder filter applies |

## Placeholder filter (applies to `generic-assignment`)

A matched VALUE is NOT a finding when it contains `${...}`, `<...>`, `{{...}}`,
or contains (case-insensitive) any of: `changeme`, `example`, `placeholder`,
`dummy`, `xxxxx`, `redacted`, `your` (as in `your-api-key`).

## Output safety (both implementations)

- Previews/summaries show at most the first 6–8 characters of a match
  followed by an ellipsis. The full secret NEVER appears in reports, logs,
  deny messages, or test output.
- `secret-guard` deny messages name the pattern ids and line numbers, not the
  values.

## Allowlist (CLI only)

`kit audit` suppresses a finding whose matched text contains a literal
substring listed in `.ai/audit-allowlist.txt` (one per line, `#` comments).
Suppressed findings are counted as `allowlisted`, not dropped silently.
Document the reason next to each allowlist entry.

## Deliberate scope

High-confidence structural tokens only. Known-gap areas (documented, not
scanned): generic high-entropy base64 blobs, connection URLs with embedded
credentials (partially covered by generic-assignment), cloud metadata keys.
False negatives are preferred over false positives at this tier — the
runtime mod must not block normal development; `kit audit` in CI is the
stricter net, and repo-level tools (gitleaks) remain recommended.
