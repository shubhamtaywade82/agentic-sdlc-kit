# secret-guard

Secret protection Mod for the Agentic SDLC Kit.

## What it does

- **`tool.call` (Bash, git commit/push)**: scans staged changes before commits
  and scans locally reachable commit history before supported pushes. Pushes
  with ambiguous ref scope or repository context are refused before execution.
  If any scan cannot be read or verified, the operation is refused (fail closed).
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

## Git commit/push detection and what is scanned

The hook finds history-changing Git commands from the parsed command
(`policies/git-command.ts`), not a substring regex. It sees wrappers and
nested shells, and ignores quoted text that merely mentions Git.

Pushes use a deliberately narrow allowlist:

| Command | Result |
| --- | --- |
| `git push` | Allowed after scanning locally reachable commit history |
| `git push origin` | Allowed after the same conservative scan |
| `git push --force origin` | Allowed; force changes update semantics, not the source-ref scope |
| `git push -v origin` | Allowed; verbose is transport/output-only |
| `git push origin main` | Denied: explicit refspec |
| `git push --all`, `--tags`, or `--mirror` | Denied: unsupported ref selection |
| `git -C sub push`, `git --git-dir ... push`, `cd sub && git push`, or a `GIT_DIR`/`GIT_WORK_TREE` override | Denied: scan repository context cannot be proven |
| Unknown flags, multiple positional arguments, or nesting too deep to inspect | Denied: target scope is uncertain |

For an accepted push, the guard runs
`git log -p --format= --all --not --remotes`. This is intentionally broader
than the current branch: it checks locally reachable commit history rather
than assuming that only `HEAD` will be published. It also covers pushes whose
configured default selects another local branch. The scan is conservative; it
is not a byte-for-byte reconstruction of Git's transport negotiation.

Only a bare push or one remote argument is accepted, with transport/output
flags from a small allowlist. Ref specs, `--all`, `--tags`, `--mirror`,
repository-redirection options, Git repository environment overrides, and
directory changes are refused before a scan can accidentally approve the
wrong repository. This restriction also
applies to commit commands when Git global options or a preceding `cd` would
make the scan run against a different repository.

A scan that cannot read its input, finds it too large, or cannot establish
the operation's scope denies the operation. Not covered: aliases, variables
and `$(...)` (not expandable), and publishing paths that never invoke
`git commit/push` (for example `gh`). A first push of a very large history
can exceed `maxInputChars`; raise it in the policy state only after assessing
the memory and latency impact.
