## What
<!-- One or two sentences on what this PR changes. -->

## Why
<!-- The problem it solves. Link the issue if there is one: Closes #123 -->

## Type of change
- [ ] New stack (`stacks/<name>/`)
- [ ] Agent rules (`AGENTS.md`, stack `AGENTS.md`, Cursor/Copilot/Claude adapters)
- [ ] Workflow, prompt, template, or checklist
- [ ] Sub-agent or slash command
- [ ] Installer or check script
- [ ] Documentation only

## How I tested it
```
<!-- Paste the output of: bash scripts/check.sh -->
```
- Tool(s) tried with: <!-- e.g. Claude Code, Cursor, Windsurf, Copilot, Gemini CLI -->
- Sample project / stack: <!-- e.g. fresh Rails 8 app -->
- What the AI did differently after this change:

## Checklist
- [ ] `bash scripts/check.sh` passes locally (CI runs it too)
- [ ] Kit paths used in shared files (`templates/...`, not `.ai/templates/...`)
- [ ] New assumptions in stack `AGENTS.md` marked `# ADJUST`
- [ ] Every command I listed actually runs on that stack
- [ ] Agents/commands/Cursor rules have the required front matter
- [ ] `README.md` updated for anything users will see
- [ ] Shared files stay tool-agnostic; tool-specific details live in adapters
- [ ] No secrets, personal data, or real company names in examples

## Notes for reviewers
<!-- Anything you're unsure about or want feedback on. -->
