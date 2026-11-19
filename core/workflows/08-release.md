# 08 — Release

Every remote and release-facing action in this workflow needs **explicit human approval
before it runs**. Never batch them into one "ok".

1. **Merge** — after CI is green and a human reviewed the PR, ask for approval to merge.
2. **Readiness & evidence** — `node .ai/kit/bin/kit.js release-check` green (fix what
   code can fix; waivers are explicit and human); latest `kit verify` report in
   `.ai/reports/verification/` is `passed` and current.
3. **Changelog & version** — update `docs/releases/CHANGELOG.md`
   (`templates/CHANGELOG.md`), bump the version (SemVer). These are normal commits.
4. **Tag** — propose the exact `git tag vX.Y.Z` command and get explicit approval before creating or pushing the tag.
5. **Release** — publishing the release artifact (GitHub Release, npm publish, gem push, …) needs its own approval.
6. **Deploy** — deploying to any environment needs its own approval. Deploy behind a feature flag when risky; monitor errors/latency for 30 min.
7. Run `checklists/release.md`. Have a rollback command ready and say what it is.

Skill: `release-engineering`
Prompt: `prompts/08-release.md`
