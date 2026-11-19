# secret-guard

Secret protection Mod for the Agentic SDLC Kit.

## What it does

- **`tool.call` (Bash, git commit/push)**: scans staged changes before they
  enter git history. (M11 ships the scanning contract; the full git-diff
  integration lands with the host SDK wiring in M10.)
- **`tool.call` (Write)**: scans file content before writing. Blocks writes
  that contain detected secrets. **Fail-closed**: if the scanner errors, the
  write is denied (never silently written unscanned).
- **`tool.call` (post-execution)**: redacts secrets from tool output before
  the model sees them. Uses the M11 redactor which verifies that every
  detected value was actually removed from the output.

## Architecture

Per ADR-0011: the detection and redaction logic lives in
`packages/core/src/secret-guard/` (runtime-independent, pure functions,
unit-tested). The Mod's `hooks/register.ts` is thin: it wires events to
the core functions and translates outcomes into host decisions.

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
- apiAccess: `ui.log`, `state.get`
- modifiesToolCalls: true

## What is NOT here yet

- `fs.write` event interception (the host SDK exposes this; M10 wires it).
- Git staged-diff scanning (requires running `git diff --cached` via the
  host; M11 ships the contract).
- Gitleaks integration (optional extended scanner; M11-03).
