# sdlc-guard

Runtime governance Mod for the Agentic SDLC Kit.

## What it does

Intercepts `tool.call` and `tool.check` events and applies the M10 policy
evaluator to destructive operations:

- `rm -rf` → `file.delete` → require-approval (or deny if scope > N files).
- `git push --force` → `git.force-push` → require-approval.
- `git rebase` → `git.rebase` → require-approval.
- Database migrations → `db.migrate` → require-approval.
- Production database mutations → `db.mutate-production` → deny (fail-closed).
- `npm publish` / `kubectl apply` / `terraform apply` → `release.*` → require-approval.

## Architecture

Per ADR-0015: policy evaluation is in `policies/` (pure functions, runtime-
independent, unit-tested in `core`). The `hooks/register.ts` is thin: it
wires events to policy functions and translates the verdict into a host
decision (`allow` / `ask` / `deny` for `tool.check`; `{ deny }` for `tool.call`).

## The non-negotiable limitation

This Mod is **not** a security sandbox. It executes with the host process's
permissions. Real isolation requires OS permissions, containers, restricted
credentials, and deployment controls. See `docs/security/SECURITY.md` §4
and ADR-0009.

## Capability manifest

Declared in `.claude-plugin/capabilities.json`:

- hooks: `tool.call`, `tool.check`
- apiAccess: `ui.log`, `state.get`
- networkAccess: false
- processExecution: false
- modifiesToolCalls: true

The installer (M15) validates the source against this manifest before
enabling the Mod.
