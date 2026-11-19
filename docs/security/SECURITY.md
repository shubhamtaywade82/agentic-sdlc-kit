# SECURITY.md — Agentic SDLC Kit

Status: M0 frozen. Threat model, trust boundaries, approval rules, and the
non-negotiable limitation that the kit is **not** an OS sandbox. Implements
the security policy referenced by `PRODUCT.md` §4 and `ARCHITECTURE.md` §4
and §6.

## 1. Threat model

| Threat                                 | Source                      | Mitigation                                                                                                | Milestone |
| -------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| Symlink traversal during install       | Malicious plugin bundle     | mktemp staging; preflight every managed path; reject symlinks; SHA-256 byte-verify staged files.          | M15       |
| Silent modification of existing files  | Installer or updater        | Skip-if-exists for user files; manifest records kit-owned files only; uninstall removes only owned files. | M15       |
| Execution of untrusted project scripts | Repository under inspection | Discovery is read-only; never `exec` a discovered script merely to identify it.                           | M2        |
| Shell injection via verification cmd   | `ProjectProfile.commands`   | Commands are argument arrays executed with `shell: false`; no shell string interpolation.                 | M6        |
| Path escape during artifact write      | Bug in `core.artifacts`     | Writes confined to `.ai-kit/` and `docs/`; path-escape test in `packages/testing`.                        | M1+       |
| Secret leakage in reports              | Tool output, git diffs      | Secret Guard Mod scans and redacts before persistence.                                                    | M11       |
| Destructive op without approval        | Agent or workflow           | Policy evaluator gates every destructive action; bypass is a Critical bug.                                | M10       |
| Skipped check counted as passed        | Verification reporting      | Status union forbids the transition; tested in `packages/testing`.                                        | M1+       |
| Scanner failure reported as clean      | Secret scanner              | Scanner failure is a `failed` (or `blocked`) verdict; never `passed`.                                     | M11       |
| Approval bypass via later stage        | Workflow bug                | Denial is terminal for the action; no transition turns `deny` into `allow`.                               | M10       |
| Model cost runaway                     | Mis-routed task             | Router starts in suggest-only mode; deterministic fallback; effort routed independently of model.         | M12       |
| Lockfile / supply-chain attack         | Compromised dependency      | Lockfile committed; CI uses `pnpm install --frozen-lockfile`; releases pin action SHAs.                   | M16       |

## 2. Trust boundaries

See `ARCHITECTURE.md` §4. In summary:

- The host runtime is **not trusted** by the core. The adapter translates and
  the core validates.
- The filesystem outside `.ai-kit/` and `docs/` is **not trusted** for writes.
  Writes outside those roots require explicit approval.
- Subprocesses spawned by `core.verification.runner` are **not trusted** to
  interpret their own arguments; arguments come from the validated
  `ProjectProfile`, never from agent free text.
- Discovered scripts in the target repository are **not trusted** to execute.
  Discovery reads files; it does not run them.

## 3. Approval rules (M0 baseline, enforced from M10)

| Action                       | Default policy                                           | Bypass allowed? |
| ---------------------------- | -------------------------------------------------------- | --------------- |
| File deletion (scoped)       | Allow if scope ≤ N files; else require approval.         | No              |
| Bulk modification (>N files) | Require approval.                                        | No              |
| Database migration           | Apply configured approval policy.                        | No              |
| Production database mutation | Require explicit authorization.                          | No              |
| Git force push               | Require approval.                                        | No              |
| Release / deploy             | Require release gate.                                    | No              |
| Secret / config modification | Apply sensitive-file policy.                             | No              |
| Dependency removal           | Review impact; require approval if transitive count > N. | No              |

`require-approval` is the default for anything not explicitly allowed. The
policy is evaluated by a **pure function** in `core.policy.evaluator`; the
adapter applies the verdict to the host. The pure function has deterministic
unit tests for every action × context.

### 3.1 Non-interactive behavior

When the host is non-interactive (CI, daemon), `require-approval` is treated
as `deny`. Fail-closed by default. Fail-open is allowed only for actions
explicitly documented as fail-open in `plugins/sdlc-guard/policies/` and only
when the consequence of failing open is reversible.

### 3.2 Bypass cannot silently turn deny into allow

A bypass flag, if it exists, MUST be:

1. Set by an explicit user action (env var, CLI flag, or config file).
2. Logged with the user identity and timestamp.
3. Limited to a specific action and scope.
4. Visible in the run report.

A bypass that silently turns `deny` into `allow` is a Critical bug. The test
suite in `plugins/sdlc-guard/tests/` (M10) includes adversarial cases that
attempt bypass via env vars, config typos, and context confusion.

## 4. The non-negotiable limitation (read this twice)

Claude Code Mods (and equivalent host-runtime plugins) execute **with the
host process's access to the machine**. They are not an operating-system
sandbox.

The Mod can:

- Evaluate a policy decision deterministically.
- Require approval before a destructive action.
- Refuse to translate a host event that violates policy.
- Redact secrets from tool output before persistence.
- Observe and report.

The Mod **cannot**:

- Prevent a determined attacker with host access from bypassing it.
- Replace OS-level file permissions, container isolation, restricted
  credentials, or deployment controls.
- Guarantee that a host-side plugin loaded outside the kit's adapter respects
  the kit's policy.

**Real isolation must come from OS permissions, containers, restricted
credentials, and deployment controls.** The kit's security model assumes the
operator has done this; the kit adds engineering discipline on top, not a
sandbox underneath.

This limitation is documented in ADR-0009 and repeated in every Mod's
README so it is impossible to miss.

## 5. Secret handling (M11 detailed; M0 baseline here)

- The kit MUST NOT log full secret values.
- The kit MUST distinguish detection from redaction (detection finds,
  redaction removes; a detected-but-not-redacted value is a finding, not a
  clean result).
- The kit MUST avoid false assurance when a scan fails (scanner error →
  `failed`, not `passed`).
- The kit MUST test partial, encoded, and multiline secrets.
- The kit MUST verify exact secret coverage before allowing residual output.
- The kit MUST make scanner failure behavior configurable and visible.

The M0 baseline (this milestone) requires only that no artifact produced by
the kit prints a secret. M11 implements full detection and redaction.

## 6. CI supply-chain (M16 detailed; M0 baseline here)

- The lockfile is committed.
- CI uses `pnpm install --frozen-lockfile`.
- GitHub Actions are pinned to full SHAs (not `@v4`).
- `shellcheck` runs on every shell script.
- A dedicated smoke job builds the CLI and runs `kit --version` on a clean
  checkout.

## 7. Reporting security issues

M0 declares the policy; the contact mechanism is finalized in M16. Until
then: report via the repository's issue tracker with the label `security`.
Do not open a public issue if the report includes a live secret or a
0-day in a dependency; contact the maintainers privately first.

## 8. Security acceptance criteria for 0.1

1. The kit does not write outside `.ai-kit/` or `docs/` without explicit
   approval. (Tested by `packages/testing/src/validators/path-escape.ts`.)
2. The contracts package has no circular dependencies and imports nothing.
   (Tested by `scripts/check-architecture.ts`.)
3. No package presents a placeholder as a working feature.
4. The CI workflow runs `pnpm verify` and fails on any error.
5. The lockfile is committed and CI uses `--frozen-lockfile`.
6. Every shell script in `scripts/` passes `shellcheck`.

Later milestones add the full governance Mods (M10), secret guard (M11),
router (M12), observer (M13), installer hardening (M15), release engineering
(M16), and adversarial test suite (M17).
