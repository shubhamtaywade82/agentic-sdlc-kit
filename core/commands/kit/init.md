---
description: Discover the project, create the profile and engineering skeleton
argument-hint: ""
---
Set up this repository for the SDLC workflow.

1. Read `AGENTS.md` §1. If the project context block is still placeholders, fill it from what you find — propose the values to me first.
2. Run discovery: `node .ai/kit/bin/kit.js inspect` and `node .ai/kit/bin/kit.js doctor`. Report anything the doctor flags.
3. Create the profile and skeleton: `node .ai/kit/bin/kit.js init --mode existing` (use `--mode greenfield` for an empty repo). Show me the generated `.ai/project.yml` — especially the `quality.commands` gates — and adjust on my request.
4. Summarize: detected stack, test framework, chosen architecture style, and which quality gates will run in `kit verify`.
5. If a stack pack is installed under `.ai/stack/`, read its `AGENTS.md` and note any commands it defines.

Do not start feature work. End with: "Ready. Use /kit:feature (existing app), /kit:app (new app), or /kit:fix."
