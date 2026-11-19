# Agent Skills — agentskills.io

The kit's `skills/` folders follow the [Agent Skills](https://agentskills.io) open
standard (originally from Anthropic, now community-governed): one folder per skill
with a `SKILL.md` entry point.

## Why

Progressive disclosure: only the `name` and `description` frontmatter (~100 tokens)
sit in context at startup. The full instructions load when a task matches, and the
bundled reference files load only when needed. You can ship a lot of expertise
without paying for it in every prompt.

## Shipped skills (nine, v5)

| Skill | When it activates |
|---|---|
| `repo-discovery` | Understanding an existing app before changing it; impact maps |
| `requirements-engineering` | Writing specs/PRDs, acceptance criteria; kit validate-spec |
| `system-design` | Architecture, ADRs, data models, API contracts |
| `implementation-planning` | Vertical-slice task plans; kit validate-plan |
| `tdd-bdd` | Implementing planned tasks, red-green-refactor, regression fixes |
| `design-pattern-selection` | Considering any pattern/abstraction; seven-category catalog |
| `code-quality` | Refactoring, maintainability, self-review before a PR |
| `security-engineering` | Auth/input/data/files/deps surfaces; kit audit |
| `release-engineering` | Changelogs, release readiness, controlled release execution |

Per-language pattern implementations (22 GoF patterns each) moved to the stack
packs: `.ai/stack/<name>/patterns/` — installed with `--stack`.

## Where they install

`skills/<name>/` in the kit → `.claude/skills/<name>/` in your project. Claude Code
loads them natively (a skill named `x` also provides the `/x` command). Other
spec-compliant clients (VS Code, Copilot, Gemini CLI, OpenCode, Cursor, ...) support
the same format; point them at the skill folders per their documentation.

## Format cheat sheet

```markdown
---
name: my-skill            # lowercase a-z 0-9 hyphens, <= 64 chars, must match the folder name
description: What it does and when to use it.   # <= 1024 chars; the router reads this
license: MIT              # optional
metadata:                 # optional string -> string map
  author: my-org
  version: "1.0"
---

# Body: < 500 lines, ideally < 5000 tokens when activated.
```

Optional folders inside a skill: `scripts/` (executable helpers), `references/`
(deep-dive docs loaded on demand), `assets/` (templates and static files).

## Validation

The kit's `scripts/check.sh` validates every skill (name/description rules, size,
frontmatter). The upstream reference implementation can validate too:

```bash
npx skills-ref validate ./skills/my-skill
```

## Writing your own

1. Copy the closest existing skill folder.
2. Rewrite the description first — it decides when the skill fires. Name the
   situations and the keywords a task would contain.
3. Keep SKILL.md short; push depth into `references/`.
4. Run `bash scripts/check.sh`; try it in at least one client.
