# Security Policy

The full threat model, trust boundaries, approval rules, and the
non-negotiable "Mods are not an OS sandbox" limitation live in
[`docs/security/SECURITY.md`](../docs/security/SECURITY.md). This file is
the entry point GitHub surfaces; the content below is the reporting policy.

## Reporting a vulnerability

- **Preferred:** use GitHub's **Report a vulnerability** (Private Vulnerability
  Reporting) on this repository's Security tab. This is private and routed to
  the maintainers.
- If you cannot use private reporting, email the maintainer listed in the
  repository owner profile. Do **not** open a public issue for anything that
  includes a live secret, a working exploit, or a 0-day in a dependency.

Include where possible: a minimal reproduction, the affected file or command,
the kit version (`kit --version`), and your assessment of impact.

## Scope

Everything in this repository is in scope: the `kit` CLI (especially the
installers: `kit install` and `kit skills install`), the four runtime Mods
under `plugins/`, the core workflow engine, and the CI workflows.

Out of scope: the three external agent-skills pack repositories (report those
in their own repositories) and vulnerabilities in dependencies that you have
not shown to be reachable through the kit.

## Handling

- Reports are acknowledged within 7 days.
- Fixes for accepted findings ship in a patch release with notes in the
  repository's `PATCH-NOTES-*.md` convention; reporters are credited unless
  they prefer otherwise.
