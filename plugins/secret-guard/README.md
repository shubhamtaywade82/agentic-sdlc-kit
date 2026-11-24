# secret-guard

Secret protection Mod for the Agentic SDLC Kit.

## What it does

- **`tool.call` (Bash, git commit/push)**: runs
  `$.process.run(['git','diff','--cached'])` and scans the staged diff
  BEFORE the command runs — a secret in what is about to be committed
  refuses the commit. If the diff cannot be read, the operation is
  refused (fail closed: unverifiable is not verified-clean).
- **`tool.call` (Write / NotebookEdit / Edit)**: scans the content being
  written (`e.content` / `e.new_source` / `e.new_string`) before the write.
  Blocks writes that contain detected secrets. **Fail-closed**: a scanner
  error or a too-large-to-scan input denies the write (never silently
  written unscanned).
- **`tool.call` (post-execution)**: redacts secrets from a tool result's
  text (the field the model reads) after `await next(e)`. Uses the
  redactor which verifies that every detected value was actually removed
  from the output.
- Every gating registration chains `.catch` so an internal error or
  timeout REFUSES the action instead of letting it through.

## Architecture

Per ADR-0011, detection and redaction are runtime-independent pure
functions — unit-tested in `policies/detect.test.ts`. Because a Claude
Code hooks module may only import its own files (plus `claude-code`
types), the M11 detector/scanner/redactor is VENDORED into
`policies/detect.ts` and must stay behaviorally compatible with
`packages/core`. The Mod's `hooks/register.ts` is thin: it wires events
to the policy functions and translates outcomes into host decisions.

## The detection vs. redaction distinction

Per RESEARCH.md §5 (M11): "Secret detection and secret redaction are
different operations. A finding does not prove that every occurrence of
that secret has been redacted."

The redactor re-runs the detector on the redacted output to verify
completeness. If any value survives, `fullyRedacted` is false and the
Mod logs a warning.

## Scanner failure behavior

Per `packages/contracts/src/secret-guard/scanner-failure.ts`: a scanner
failure is NEVER reported as `clean`. For Write operations, the Mod is
fail-closed (deny) so unscanned content is never written.

## Capability manifest

- hooks: `tool.call`
- apiAccess: `ui.log`, `process.run`, `state.get`
- processExecution: true
- modifiesToolCalls: true

## What is NOT here yet

- Gitleaks integration (optional extended scanner; M11-03).
- Redaction of non-text result fields (currently only the `text` the
  model reads is rewritten).

## Install (user scope)

```
/plugin install secret-guard --marketplace shubhamtaywade82/agentic-sdlc-kit
```

Or from a local clone: `claude plugin marketplace add <clone-path>` then `claude plugin install secret-guard@agentic-sdlc-kit --scope user`.

## DhanHQ credentials

- `dhan-credential` (critical): a variable whose name contains `dhan` and `token`, `secret` or `key`, assigned a 20+ character value that contains a digit and is not a placeholder (`your_...`, `changeme`, `${VAR}`, `<...>`). Matched by name because no official token format is pinned in this repo; references such as `self.config.dhan_access_token` are not flagged.
- `jwt` (high): any three-part `eyJ...` token. This is what catches a bare DhanHQ access token, on the assumption that it is a JWT; verify that against a redacted real sample.
- `DHAN_CLIENT_ID` and short numeric values are not secrets and are not flagged.

## Unscanned input fails closed

Text over `maxInputChars` is never reported as clean. `redactSecrets` returns `status: 'not-scanned'` (`fullyRedacted: false`) with a `[WITHHELD: ...]` marker instead of the raw text; the tool-result hook surfaces the marker and logs it. A staged diff the scanner skipped (`skipped-too-large`, `skipped-ignored`) denies the commit/push instead of passing it through. `status` is one of `verified-clean`, `redacted`, `not-scanned`, `failed`.
