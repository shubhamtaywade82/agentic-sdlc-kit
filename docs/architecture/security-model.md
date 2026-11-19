# Security Model

The kit touches developer machines and their repositories. This is the
threat-informed summary; the installer guarantees are regression-tested in
`tests/run-tests.sh`.

## Installer (attack surface: arbitrary repo → files on disk)

| Guarantee | Mechanism | Test |
|---|---|---|
| No symlink traversal | Target root + every managed path component verified BEFORE any write; a symlink anywhere aborts with zero writes | symlink-attack matrix (8 paths) |
| No modification of pre-existing files | Everything is staged in a private temp dir, transformed there, then copied with skip-if-exists; SHA-256 byte-identity tests on pre-existing files | pre-existing files group |
| No writes outside the target | per-path escape check + outside canary directory stays empty in every test | victim-empty assertions |
| Clean removal | every added path recorded in `.ai/manifest`; uninstall removes exactly those, keeps user files, refuses symlinks | uninstall group |
| Predictable failures | missing parent → clean error; unknown flags → usage error 2; never partial writes | destination/argument groups |

## kit CLI (attack surface: model-generated plans → process execution)

- **No shell. Ever.** Commands from the profile are validated argument arrays
  executed with `spawn(file, args, {shell:false, cwd, timeout})`. A string
  where an array belongs is a config error, not a command.
- **Bounded execution** — per-command timeout (default 600s).
- **Fail-closed statuses** — a check is `failed`, `skipped` (with reason), or
  `blocked`; skipped never counts as passed.
- **No network, no telemetry** at runtime; reports stay in the repo
  (`.ai/reports/`).
- **Secret-safe output** — `kit audit` previews truncate findings; the full
  secret never appears in any output or report.

## Runtime mods (attack surface: code that runs inside the agent host)

Mods run with the **user's full machine privileges — they are not a security
sandbox** (this is a platform property, documented by Claude Code). The kit's
stance:

- **Fail-closed gating** — every denying hook chains `.catch()` to a deny
  result, so a crashed or timed-out guard refuses the action instead of
  allowing it (default host behavior would skip the hook).
- **Read-only policies** — guards and reviewers (mods and agents both) inspect
  and deny/ask; they do not rewrite commands.
- **Complementary, not a replacement** — force-push protection also belongs in
  native Git/host config; secret scanning also belongs in CI (gitleaks et
  al.); the mods add contextual, interactive enforcement on top.
- **Self-contained plugins** — each mod imports only its own files; no cross-
  plugin imports, no runtime package installs, no network calls.
- **Consent model** — mods are opt-in (`install.sh --runtime`), the
  model-router is off by default, and `main`-conversation model rewrites
  require explicit profile opt-in (pinned-model preservation).

## Secrets handling (kit-wide)

- Canonical detection patterns: `contracts/secret-patterns.md` (implemented
  identically in `kit audit` and the `secret-guard` mod; both tested against
  real-shaped samples and placeholder suppressions).
- `.env*`, `*.pem`, `*.key` are write-protected by default (guard mod +
  profile defaults); `.ai/reports/runs/` telemetry is local-only by default.
- The kit itself ships no secrets, makes no network calls at install time, and
  pins CI actions to full commit SHAs.

## Trust boundaries summary

```
untrusted: model output, project profile values, plan/spec documents
validated at: kit CLI (structure), installer (paths), guards (policies)
trusted after: schema validation + human approval gates
```

Model-generated content influences *what is proposed*; deterministic code
decides *what is executed*; a human approves *what crosses a safety boundary*
(AGENTS.md §6).
