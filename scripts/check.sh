#!/usr/bin/env bash
# Agentic SDLC Kit (ai-dev-kit) self-check. Run before opening a pull request:
#   bash scripts/check.sh
#
# 1. Shell syntax of every script (bash -n)
# 2. ShellCheck (skipped with a note when not installed; CI enforces it)
# 3. Structure: components registry, six commands, nine skills, four agents,
#    four stacks, four mods, adapters, Agent Skills spec, CI SHA pinning
# 4. kit CLI: build is current + full test suite (node --test)
# 5. Runtime mods: hooks typecheck + policy test suite (via runtime/package.json)
# 6. Installer regression suite (tests/run-tests.sh) — symlink safety,
#    byte-preservation, idempotency, paths with spaces, manifest/uninstall
# 7. MCP server smoke test (only when a build exists; CI builds it in its own job)
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
fail=0

err()  { echo "FAIL: $*" >&2; fail=1; }
note() { echo "note: $*"; }

# ------------------------------------------------------------- 1. syntax ---
for f in "$KIT"/scripts/*.sh "$KIT"/tests/*.sh; do
  bash -n "$f" || err "syntax error in ${f#"$KIT"/}"
done

# ---------------------------------------------------------- 2. shellcheck ---
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck --severity=error "$KIT"/scripts/*.sh "$KIT"/tests/*.sh \
    || err "shellcheck reported errors (CI runs the same gate)"
else
  note "shellcheck not installed — skipping (CI enforces it on pull requests)."
fi

# ----------------------------------------------------------- 3. structure ---
# Components registry parses and names the three components + CLI.
command -v node >/dev/null 2>&1 && node -e '
  const c = require(process.argv[1] + "/components.json");
  const need = ["sdlc-core", "kit-cli", "sdlc-runtime", "sdlc-stacks"];
  for (const k of need) if (!c.components[k]) throw new Error("missing component " + k);
  if (c.version !== "5.0.0") throw new Error("version mismatch");
  if ((c.components["sdlc-stacks"].entries || []).length !== 4) throw new Error("expected 4 stacks");
' "$KIT" 2>/dev/null || err "components.json invalid (version/sections/entries)"

# Exactly six /kit: commands with front matter and plain $ARGUMENTS.
COMMANDS=("init" "app" "feature" "fix" "review" "release")
[ "$(ls "$KIT"/core/commands/kit/*.md 2>/dev/null | wc -l | tr -d ' ')" = "6" ] \
  || err "expected exactly 6 commands in core/commands/kit/"
for c in "${COMMANDS[@]}"; do
  f="$KIT/core/commands/kit/$c.md"
  [ -f "$f" ] || { err "missing command kit/$c.md"; continue; }
  head -1 "$f" | grep -q '^---$' || err "missing front matter: core/commands/kit/$c.md"
  grep -q '\${ARGUMENTS' "$f" && err "command uses unsupported \${ARGUMENTS...}: kit/$c.md"
done

# Exactly four agents, read-only analysis roles.
AGENTS=("repository-analyst" "architecture-reviewer" "code-reviewer" "security-reviewer")
[ "$(ls "$KIT"/core/agents/*.md 2>/dev/null | wc -l | tr -d ' ')" = "4" ] \
  || err "expected exactly 4 agents in core/agents/"
for a in "${AGENTS[@]}"; do
  f="$KIT/core/agents/$a.md"
  [ -f "$f" ] || { err "missing agent $a.md"; continue; }
  head -1 "$f" | grep -q '^---$' || err "missing front matter: core/agents/$a.md"
  grep -q '^name:' "$f" && grep -q '^description:' "$f" \
    || err "agent needs name+description: core/agents/$a.md"
done

# Stacks: required files, ADJUST markers, Cursor rules, patterns pack, README docs.
for d in "$KIT"/stacks/*/; do
  s="$(basename -- "$d")"
  [ -f "$d/AGENTS.md" ] || err "stacks/$s: missing AGENTS.md"
  ls "$d"/.cursor/rules/*.mdc >/dev/null 2>&1 || err "stacks/$s: no Cursor rules"
  [ -d "$d/patterns" ] || err "stacks/$s: missing patterns/ pack"
  [ -f "$d/patterns/README.md" ] || err "stacks/$s: patterns/README.md missing"
  grep -q "# ADJUST" "$d/AGENTS.md" || err "stacks/$s: AGENTS.md has no # ADJUST markers"
  grep -q "tag" "$d/AGENTS.md" || err "stacks/$s: safety section must cover tags/releases/deploy"
  grep -q -- "--stack $s" "$KIT/README.md" \
    || err "stacks/$s: not documented in README (expected '--stack $s')"
done
# rails-ts carries both pattern sets; the others exactly one.
[ -d "$KIT/stacks/rails-ts/patterns/ruby-rails" ] && [ -d "$KIT/stacks/rails-ts/patterns/typescript-node" ] \
  || err "stacks/rails-ts: expected ruby-rails + typescript-node pattern sets"

# Runtime: four mods, plugin manifests, hooks modules, gating hooks fail closed.
MODS=("sdlc-guard" "model-router" "secret-guard" "run-observer")
for m in "${MODS[@]}"; do
  d="$KIT/runtime/$m"
  [ -f "$d/.claude-plugin/plugin.json" ] || { err "runtime/$m: missing .claude-plugin/plugin.json"; continue; }
  [ -f "$d/hooks/hooks.json" ] || err "runtime/$m: missing hooks/hooks.json"
  [ -f "$d/hooks/register.ts" ] || err "runtime/$m: missing hooks/register.ts"
  grep -q '"modules"' "$d/hooks/hooks.json" || err "runtime/$m: hooks.json has no modules key"
  grep -q "\"$m\"" "$d/.claude-plugin/plugin.json" || err "runtime/$m: plugin.json name mismatch"
  grep -q '"version": "5.0.0"' "$d/.claude-plugin/plugin.json" || err "runtime/$m: plugin version not 5.0.0"
done
for m in sdlc-guard secret-guard; do
  registrations="$(grep -c "on('tool.call'" "$KIT/runtime/$m/hooks/register.ts" || true)"
  catches="$(grep -c '\.catch(' "$KIT/runtime/$m/hooks/register.ts" || true)"
  [ "$catches" -ge "$registrations" ] || err "runtime/$m: every gating hook registration must chain .catch (fail closed)"
done

# Adapters: front matter + no leading-slash /AGENTS.md references.
for f in "$KIT"/.cursor/rules/*.mdc "$KIT"/stacks/*/.cursor/rules/*.mdc; do
  head -1 "$f" | grep -q '^---$' || err "missing front matter: ${f#"$KIT"/}"
done
for f in "$KIT"/.cursor/rules/*.mdc "$KIT"/.windsurf/rules/*.md \
         "$KIT/.github/copilot-instructions.md" "$KIT/CLAUDE.md" "$KIT/GEMINI.md"; do
  grep -q '/AGENTS\.md' "$f" && err "leading-slash /AGENTS.md reference in ${f#"$KIT"/}"
done

# Agent Skills (agentskills.io): folder/name match, syntax, sizes, front matter.
for d in "$KIT"/core/skills/*/; do
  name="$(basename -- "$d")"
  f="$d/SKILL.md"
  [ -f "$f" ] || { err "skills/$name: missing SKILL.md"; continue; }
  head -1 "$f" | grep -q '^---$' || err "skills/$name: missing front matter"
  fm_name="$(sed -n 's/^name:[[:space:]]*//p' "$f" | head -1 | tr -d '"')"
  [ "$fm_name" = "$name" ] || err "skills/$name: frontmatter name '$fm_name' must match folder"
  printf '%s' "$fm_name" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$' \
    || err "skills/$name: name must be lowercase alphanumerics/hyphens"
  [ "${#fm_name}" -le 64 ] || err "skills/$name: name longer than 64 chars"
  sed -n 's/^description:[[:space:]]*//p' "$f" | head -1 | grep -q '.' \
    || err "skills/$name: empty description"
  [ "$(wc -l <"$f")" -le 500 ] || err "skills/$name: SKILL.md over 500 lines"
done
SKILL_COUNT="$(ls -d "$KIT"/core/skills/*/ 2>/dev/null | wc -l | tr -d ' ')"
[ "$SKILL_COUNT" = "9" ] || err "expected exactly 9 skills, found $SKILL_COUNT"

# Docs: architecture contracts + ADRs + migration guide present.
for f in system-design.md security-model.md versioning.md \
         contracts/project-profile.md contracts/verification-report.md \
         contracts/plan-and-spec.md contracts/secret-patterns.md; do
  [ -f "$KIT/docs/architecture/$f" ] || err "docs/architecture/$f missing"
done
[ "$(ls "$KIT"/docs/adr/ADR-*.md 2>/dev/null | wc -l | tr -d ' ')" -ge 8 ] \
  || err "expected >= 8 ADRs in docs/adr/"
[ -f "$KIT/docs/migration-v4-to-v5.md" ] || err "docs/migration-v4-to-v5.md missing"

# CI: actions pinned to full commit SHAs (no floating tags).
for wf in "$KIT"/.github/workflows/*.yml; do
  grep -Eq 'uses: actions/[a-z-]+@[0-9a-f]{40}' "$wf" \
    || err "CI must pin actions to full 40-char commit SHAs: ${wf#"$KIT"/}"
  grep -Eq 'uses: actions/[a-z-]+@v[0-9]' "$wf" \
    && err "CI uses a floating action tag (must be SHA-pinned): ${wf#"$KIT"/}"
done

# MCP server: package.json sane when present.
[ -f "$KIT/core/mcp/server/package.json" ] || err "core/mcp/server: missing package.json"

# ------------------------------------------------------- 4. kit CLI suite ---
if command -v node >/dev/null 2>&1; then
  echo
  echo "Building + testing the kit CLI (cli/)..."
  if [ ! -x "$KIT/cli/node_modules/.bin/tsc" ]; then
    note "cli devDependencies missing — running npm install (typescript + @types/node only)."
    (cd "$KIT/cli" && npm install --no-audit --no-fund --silent >/dev/null 2>&1) \
      || err "kit CLI: npm install failed (network required once; CI caches it)"
  fi
  if (cd "$KIT/cli" && npm --silent run test >/tmp/kit-cli-test.log 2>&1); then
    echo "kit CLI: tests passed."
    # dist must be current: rebuild over dist must produce no diff-worthy change.
    (cd "$KIT/cli" && npm --silent run build >/dev/null 2>&1) || err "kit CLI: rebuild failed"
  else
    err "kit CLI tests failed (see /tmp/kit-cli-test.log)"
  fi
else
  note "node not found — kit CLI tests skipped (CI enforces them)."
fi

# ------------------------------------------------------- 5. runtime suite ---
if command -v node >/dev/null 2>&1; then
  echo
  echo "Typechecking + testing runtime mods (runtime/)..."
  if [ ! -x "$KIT/runtime/node_modules/.bin/tsc" ]; then
    note "runtime devDependencies missing — running npm install."
    (cd "$KIT/runtime" && npm install --no-audit --no-fund --silent >/dev/null 2>&1) \
      || err "runtime mods: npm install failed (network required once; CI caches it)"
  fi
  if (cd "$KIT/runtime" && npm --silent test >/tmp/kit-runtime-test.log 2>&1); then
    echo "runtime mods: policy tests passed."
  else
    err "runtime mods tests failed (see /tmp/kit-runtime-test.log)"
  fi
else
  note "node not found — runtime tests skipped (CI enforces them)."
fi

# ------------------------------------------------- 6. regression suite ---
echo
echo "Running installer regression suite (tests/run-tests.sh)..."
bash "$KIT/tests/run-tests.sh" || fail=1

# ---------------------------------------------------- 7. MCP smoke test ---
if [ -f "$KIT/core/mcp/server/build/index.js" ] && command -v node >/dev/null 2>&1; then
  echo
  echo "Running MCP server smoke test..."
  node "$KIT/tests/mcp-smoke.mjs" || fail=1
else
  note "MCP smoke test skipped (no build present). Build with: cd core/mcp/server && npm install && npm run build"
fi

# --------------------------------------------------------------- verdict ---
echo
if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks failed."
  exit 1
fi
