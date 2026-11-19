# Prompt: Release Notes

Produce release material only — do not push, tag, or deploy without explicit approval for each action.

From `git log <last-tag>..HEAD --oneline` and merged PRs, produce:
1. CHANGELOG entry (Added/Changed/Fixed/Removed/Security) per templates/CHANGELOG.md.
2. Recommended SemVer bump with reason.
3. Proposed tag name and exact commands to tag/publish/deploy — present them and wait.
4. Deploy notes: migrations, env vars, feature flags, rollback steps.
