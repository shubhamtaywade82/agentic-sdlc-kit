# sdlc-guard

Runtime governance Mod for the Agentic SDLC Kit.

## What it does

Intercepts `tool.call` and `tool.check` events and applies the M10 policy
evaluator to destructive Bash commands:

- `rm -rf` → `file.delete` → require-approval (or deny if scope > N files).
- `git push --force` → `git.force-push` → require-approval.
- `git rebase` → `git.rebase` → require-approval.
- Database migrations → `db.migrate` → require-approval.
- Production database mutations → `db.mutate-production` → deny (fail-closed).
- `npm publish` / `kubectl apply` / `terraform apply` → `release.*` → require-approval.

Approval is REAL: the hook awaits `$.ui.ask('…', ['Run it', 'Refuse'])`
before letting a require-approval command through. An unanswered or
dismissed question — including a headless run with nobody to ask —
REFUSES the command. On `tool.check` the same verdicts surface as
`{ decision: 'ask' | 'deny', reason }`. Both registrations chain
`.catch` so a hook error or timeout refuses the action (fail closed);
the host would otherwise skip a failed hook and let the command run.

## Architecture

Per ADR-0015: policy evaluation is in `policies/` (pure functions,
runtime-independent, unit-tested). Because a Claude Code hooks module may
only import its own files (plus `claude-code` types), the M10 evaluator
and action-classification types are VENDORED into `policies/` and must
stay compatible with `packages/core` / `packages/contracts`. The
`hooks/register.ts` is thin: it wires events to policy functions and
translates the verdict into a host decision (`{ decision, reason }` for
`tool.check`; `{ deny }` or an `$.ui.ask` approval flow for `tool.call`).

## The non-negotiable limitation

This Mod is **not** a security sandbox. It executes with the host process's
permissions. Real isolation requires OS permissions, containers, restricted
credentials, and deployment controls. See `docs/security/SECURITY.md` §4
and ADR-0009.

## Capability manifest

Declared in `.claude-plugin/capabilities.json`:

- hooks: `tool.call`, `tool.check`
- apiAccess: `ui.log`, `ui.ask`, `state.get`
- networkAccess: false
- processExecution: false
- modifiesToolCalls: true

The installer (M15) validates the source against this manifest before
enabling the Mod.

## Install (user scope)

```
/plugin install sdlc-guard --marketplace shubhamtaywade82/agentic-sdlc-kit
```

Or from a local clone: `claude plugin marketplace add <clone-path>` then `claude plugin install sdlc-guard@agentic-sdlc-kit --scope user`.
