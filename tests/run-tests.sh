#!/usr/bin/env bash
# Agentic SDLC Kit (ai-dev-kit) — installer regression tests. v5
#
# Usage: bash tests/run-tests.sh
#
# Every test runs in a throwaway sandbox with two directories:
#   $PROJ   the install target
#   $VICTIM a directory OUTSIDE the target, used to detect any write that
#           escapes the target boundary (symlink attacks)
#
# Covers the findings from the v3 independent review (kept as permanent gates):
#   - Critical: symlink traversal in managed directories
#   - High:     pre-existing instruction files must stay byte-identical
#   - High:     the suite must fail when either defect reappears
#   - Medium:   destination creation, argument handling, path rewriting,
#               approval-gate language, CI pinning
# Plus v5: component selection (--runtime, --stack), kit CLI install,
# mods layout, command/skill/agent inventory, MCP paths.
set -u

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
INSTALL="$KIT/scripts/install.sh"
UNINSTALL="$KIT/scripts/uninstall.sh"

TMPROOT="$(mktemp -d "${TMPDIR:-/tmp}/ai-dev-kit-tests.XXXXXX")"
trap 'rm -rf "$TMPROOT"' EXIT

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ok  - $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL - $1" >&2; }

group() { echo; echo "== $1"; }

# ------------------------------------------------------------ assertions ---
a_ok() { # a_ok <desc> <cmd...>  (pass when cmd exits 0)
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$d"; else bad "$d"; fi
}
a_no() { # a_no <desc> <cmd...>  (pass when cmd exits non-zero)
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then bad "$d"; else pass "$d"; fi
}
a_file()   { local p; p="$(projpath "$1")"; a_ok "exists: $1" [ -f "$p" ]; }
a_nofile() { local p; p="$(projpath "$1")"; a_ok "absent: $1" [ ! -e "$p" ]; }
a_grep() { # a_grep <desc> <ERE-pattern> <file>
  local d="$1" pat="$2" f="$3"
  if grep -Eq -- "$pat" "$f" 2>/dev/null; then pass "$d"; else bad "$d"; fi
}
a_nogrep() { # a_nogrep <desc> <ERE-pattern> <file>
  local d="$1" pat="$2" f="$3"
  if grep -Eq -- "$pat" "$f" 2>/dev/null; then bad "$d"; else pass "$d"; fi
}
projpath() { # resolve a path against $PROJ unless absolute
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$PROJ/$1" ;;
  esac
}

sha() { # portable sha256 of a file
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

a_same() { # a_same <desc> <fileA> <fileB-or-cached-hash...>
  local d="$1" a="$2" b="$3"
  if [ "$(sha "$a")" = "$(sha "$b")" ]; then pass "$d"; else bad "$d"; fi
}

count_files() { # count regular files under a directory
  find "$1" -type f 2>/dev/null | wc -l | tr -d ' '
}

# ------------------------------------------------------------- sandboxing --
SB=""    # current sandbox root
PROJ=""  # install target
VICTIM="" # outside-the-target canary directory
OUT=""   # captured installer output

new_sandbox() {
  SB="$TMPROOT/sb$((SB_COUNT += 1))"
  PROJ="$SB/proj"
  VICTIM="$SB/victim"
  mkdir -p "$PROJ" "$VICTIM"
  OUT="$SB/install.log"
}
SB_COUNT=0

run_install() { # any args; output captured to $OUT
  bash "$INSTALL" "$@" >"$OUT" 2>"$SB/install.err"
}
# NOTE: $? must be captured immediately; call as: run_install ...; rc=$?

victim_is_empty() { [ "$(count_files "$VICTIM")" -eq 0 ]; }

# =========================================================== 1. fresh install
group "fresh core install (default: no runtime, no stack)"
new_sandbox
run_install "$PROJ"; rc=$?
a_ok "install exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
for f in AGENTS.md CLAUDE.md GEMINI.md \
         .github/copilot-instructions.md .github/pull_request_template.md \
         .cursor/rules/00-core.mdc .windsurf/rules/00-core.md \
         .claude/agents/repository-analyst.md .claude/agents/architecture-reviewer.md \
         .claude/agents/code-reviewer.md .claude/agents/security-reviewer.md \
         .claude/commands/kit/init.md .claude/commands/kit/app.md \
         .claude/commands/kit/feature.md .claude/commands/kit/fix.md \
         .claude/commands/kit/review.md .claude/commands/kit/release.md \
         .claude/skills/repo-discovery/SKILL.md .claude/skills/requirements-engineering/SKILL.md \
         .claude/skills/system-design/SKILL.md .claude/skills/implementation-planning/SKILL.md \
         .claude/skills/tdd-bdd/SKILL.md .claude/skills/design-pattern-selection/SKILL.md \
         .claude/skills/code-quality/SKILL.md .claude/skills/security-engineering/SKILL.md \
         .claude/skills/release-engineering/SKILL.md \
         .claude/skills/design-pattern-selection/references/catalog.md \
         .claude/skills/design-pattern-selection/references/resilience.md \
         .ai/workflows/00-overview.md .ai/workflows/08-release.md .ai/workflows/09-operations.md \
         .ai/prompts/00-session-start.md .ai/templates/PR.md .ai/templates/SPEC.md \
         .ai/templates/PLAN.md .ai/checklists/definition-of-done.md \
         .ai/docs/TOOL_SETUP.md .ai/docs/skills.md \
         .ai/mcp/README.md .ai/mcp/.mcp.json.example \
         .ai/mcp/server/package.json .ai/mcp/server/src/index.ts \
         .ai/kit/bin/kit.js .ai/kit/dist/cli.js .ai/kit/package.json \
         docs/product/.gitkeep docs/specifications/features/.gitkeep \
         docs/specifications/technical/.gitkeep docs/plans/.gitkeep \
         docs/architecture/adr/.gitkeep docs/testing/.gitkeep \
         docs/security/threat-models/.gitkeep docs/releases/.gitkeep \
         .ai/manifest; do
  a_file "$f"
done
a_grep "installer reported added files" "^added:" "$OUT"
a_ok "nothing written outside the target (victim empty)" victim_is_empty
a_ok "commands dir holds exactly 6 files" [ "$(ls "$PROJ/.claude/commands/kit" | wc -l | tr -d ' ')" = "6" ]
a_ok "exactly 9 skill folders installed" [ "$(ls -d "$PROJ"/.claude/skills/*/ | wc -l | tr -d ' ')" = "9" ]
a_ok "no runtime mods without --runtime" [ ! -d "$PROJ/.ai/mods/sdlc-guard" ]
a_file ".ai/mods/README.md"
a_ok "no stack pack without --stack" [ ! -d "$PROJ/.ai/stack" ]
a_nofile "old v4 doc dirs not created: docs/prd" "docs/prd/.gitkeep"
a_nofile "old v4 doc dirs not created: docs/specs" "docs/specs/.gitkeep"

group "installed kit CLI works in the target project"
if command -v node >/dev/null 2>&1; then
  (cd "$PROJ" && node .ai/kit/bin/kit.js --version >/dev/null 2>&1); a_ok "kit --version runs" [ $? -eq 0 ]
  (cd "$PROJ" && node .ai/kit/bin/kit.js doctor >/dev/null 2>&1);    a_ok "kit doctor exits 0" [ $? -eq 0 ]
  (cd "$PROJ" && node .ai/kit/bin/kit.js init >/dev/null 2>&1);      a_ok "kit init creates .ai/project.yml" [ -f "$PROJ/.ai/project.yml" ]
  (cd "$PROJ" && node .ai/kit/bin/kit.js init >/dev/null 2>&1);      a_no "kit init refuses to overwrite profile" [ $? -eq 0 ]
  a_grep "generated profile is a valid v1 profile" "version: 1" "$PROJ/.ai/project.yml"
else
  echo "  (node unavailable — CLI runtime checks skipped; CLI suite runs in check.sh/CI)"
fi

# ===================================================== 2. destination handling
group "destination creation and validation"
new_sandbox
run_install "$SB/brand-new"; rc=$?
a_ok "creates missing target when parent exists (rc=$rc)" [ "$rc" -eq 0 ]
a_file "$SB/brand-new/AGENTS.md"

new_sandbox
run_install "$SB/no/such/parent/newdir"; rc=$?
a_no "fails when parent is missing (rc=$rc)" [ "$rc" -eq 0 ]
a_grep "error mentions the parent" "parent" "$SB/install.err"
a_nofile "$SB/no/such/parent/newdir"

new_sandbox
: >"$SB/afile"
run_install "$SB/afile"; rc=$?
a_no "fails when target is a file (rc=$rc)" [ "$rc" -eq 0 ]

# ========================================================== 3. CLI arguments
group "argument handling"
new_sandbox
run_install --bogus "$PROJ"; rc=$?
a_no "unknown option rejected (rc=$rc)" [ "$rc" -eq 0 ]
a_grep "usage shown for unknown option" "Usage" "$SB/install.err"

new_sandbox
run_install --help >"$OUT" 2>/dev/null; rc=$?
a_ok "--help exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
a_grep "--help lists --runtime" "runtime" "$OUT"
a_grep "--help lists --stack" "stack" "$OUT"

new_sandbox
run_install "$PROJ" extra-arg; rc=$?
a_no "extra positional rejected (rc=$rc)" [ "$rc" -eq 0 ]

new_sandbox
run_install "$PROJ" --stack nope; rc=$?
a_no "unknown stack rejected (rc=$rc)" [ "$rc" -eq 0 ]

new_sandbox
run_install "$PROJ" --stack; rc=$?
a_no "--stack without value rejected (rc=$rc)" [ "$rc" -eq 0 ]

# ========================================================== 4. stack packs
group "stack packs install conventions + patterns"
new_sandbox
run_install "$PROJ" --stack rails; rc=$?
a_ok "--stack rails installs (rc=$rc)" [ "$rc" -eq 0 ]
a_grep "rails AGENTS.md installed" "Rails" "$PROJ/AGENTS.md"
a_file "$PROJ/.cursor/rules/30-rails.mdc"
a_file "$PROJ/.cursor/rules/00-core.mdc"
a_file "$PROJ/.ai/stack/rails/AGENTS.md"
a_file "$PROJ/.ai/stack/rails/patterns/README.md"
a_file "$PROJ/.ai/stack/rails/patterns/ruby-rails/behavioral.md"

new_sandbox
run_install "$PROJ" --stack=rails-ts; rc=$?
a_ok "--stack=rails-ts form works (rc=$rc)" [ "$rc" -eq 0 ]
a_file "$PROJ/.ai/stack/rails-ts/patterns/ruby-rails/behavioral.md"
a_file "$PROJ/.ai/stack/rails-ts/patterns/typescript-node/behavioral.md"

new_sandbox
run_install "$PROJ" --stack node-ts-lib; rc=$?
a_ok "--stack node-ts-lib installs (rc=$rc)" [ "$rc" -eq 0 ]
a_file "$PROJ/.ai/stack/node-ts-lib/patterns/typescript-node/creational.md"

# ========================================================== 5. runtime mods
group "runtime mods install (--runtime)"
new_sandbox
run_install "$PROJ" --runtime; rc=$?
a_ok "--runtime installs (rc=$rc)" [ "$rc" -eq 0 ]
for mod in sdlc-guard model-router secret-guard run-observer; do
  a_file ".ai/mods/$mod/.claude-plugin/plugin.json"
  a_file ".ai/mods/$mod/hooks/hooks.json"
  a_file ".ai/mods/$mod/hooks/register.ts"
  a_file ".ai/mods/$mod/README.md"
  a_grep "mod manifest names $mod" "\"$mod\"" "$PROJ/.ai/mods/$mod/.claude-plugin/plugin.json"
  a_grep "$mod hooks.json points at register.ts" "register.ts" "$PROJ/.ai/mods/$mod/hooks/hooks.json"
done
a_file ".ai/mods/README.md"
a_nofile "no node_modules staged into mods" ".ai/mods/sdlc-guard/node_modules/package.json"
a_ok "victim untouched by runtime install" victim_is_empty

new_sandbox
run_install "$PROJ" --runtime >/dev/null 2>&1
run_install "$PROJ" --runtime; rc=$?
a_ok "re-install with --runtime is idempotent (rc=$rc)" [ "$rc" -eq 0 ]

# =============================================== 6. pre-existing files (HIGH)
group "pre-existing files are never modified (v3 review: High)"
new_sandbox
cat >"$PROJ/AGENTS.md" <<'EOF'
# My own AGENTS.md
See templates/PR.md and workflows/00-overview.md for the old kit layout.
Keep my references: prompts/00-session-start.md, checklists/security.md.
EOF
AGENTS_SHA="$(sha "$PROJ/AGENTS.md")"
mkdir -p "$PROJ/.claude/commands/kit" "$PROJ/.claude/agents" "$PROJ/.cursor/rules" "$PROJ/.windsurf/rules"
printf 'Custom command pointing at workflows/04-build-tdd.md and templates/PR.md.\n' >"$PROJ/.claude/commands/kit/mine.md"
printf 'Custom agent that reads checklists/code-review.md.\n' >"$PROJ/.claude/agents/mine.md"
printf 'Custom rule referencing workflows/00-overview.md.\n' >"$PROJ/.cursor/rules/mine.mdc"
printf 'Custom windsurf rule referencing prompts/01-clarify.md.\n' >"$PROJ/.windsurf/rules/mine.md"
printf '# My CLAUDE.md with templates/ADR.md refs\n' >"$PROJ/CLAUDE.md"
printf '# My GEMINI.md with workflows refs\n' >"$PROJ/GEMINI.md"
printf 'Mine. templates/CHANGELOG.md.\n' >"$PROJ/.github/copilot-instructions.md" 2>/dev/null || { mkdir -p "$PROJ/.github"; printf 'Mine. templates/CHANGELOG.md.\n' >"$PROJ/.github/copilot-instructions.md"; }
mkdir -p "$PROJ/.github"
sha_store="$SB"
for f in .claude/commands/kit/mine.md .claude/agents/mine.md .cursor/rules/mine.mdc .windsurf/rules/mine.md CLAUDE.md GEMINI.md .github/copilot-instructions.md; do
  cp "$PROJ/$f" "$sha_store/$(echo "$f" | tr '/' '_').orig"
done
run_install "$PROJ"; rc=$?
a_ok "install with pre-existing files exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
if [ "$(sha "$PROJ/AGENTS.md")" = "$AGENTS_SHA" ]; then pass "pre-existing AGENTS.md byte-identical"; else bad "pre-existing AGENTS.md byte-identical"; fi
for f in .claude/commands/kit/mine.md .claude/agents/mine.md .cursor/rules/mine.mdc .windsurf/rules/mine.md CLAUDE.md GEMINI.md .github/copilot-instructions.md; do
  a_same "pre-existing $f byte-identical" "$PROJ/$f" "$sha_store/$(echo "$f" | tr '/' '_').orig"
done
a_grep "installer announced the skip" "skip \\(exists\\): AGENTS.md" "$OUT"
a_ok "victim untouched during skip test" victim_is_empty

group "dangling symlink at a kit file path is skipped, not written through"
new_sandbox
mkdir -p "$PROJ/.claude/commands/kit" "$VICTIM/.claude/commands/kit"
ln -s "$VICTIM/.claude/commands/feature.md" "$PROJ/.claude/commands/kit/feature.md"
run_install "$PROJ"; rc=$?
a_ok "install succeeds with dangling symlink in place (rc=$rc)" [ "$rc" -eq 0 ]
a_ok "dangling symlink not followed (victim still empty)" victim_is_empty
a_ok "symlink left as-is" [ -L "$PROJ/.claude/commands/kit/feature.md" ]

# ================================================= 7. symlink defense (CRITICAL)
group "symlink defense — target root and managed directories (v3 review: Critical)"
symlink_attack() { # symlink_attack <desc> <relative-symlink-path|.>
  local desc="$1" rel="$2"
  new_sandbox
  if [ "$rel" = "." ]; then
    # target root itself is a symlink to somewhere outside the project
    ln -s "$VICTIM/attack" "$SB/target"
    run_install "$SB/target"; rc=$?
    a_no "$desc: install rejected (rc=$rc)" [ "$rc" -eq 0 ]
    a_ok "$desc: zero writes escaped through the link" victim_is_empty
    a_ok "$desc: link target untouched" [ ! -e "$VICTIM/attack/AGENTS.md" ]
    return
  fi
  mkdir -p "$(dirname -- "$PROJ/$rel")" "$VICTIM/attack"
  ln -s "$VICTIM/attack" "$PROJ/$rel"
  run_install "$PROJ"; rc=$?
  a_no "$desc: install rejected (rc=$rc)" [ "$rc" -eq 0 ]
  a_ok "$desc: zero writes escaped through the link" victim_is_empty
  a_nofile "$PROJ/AGENTS.md"
  a_nofile "$PROJ/.ai/manifest"
}
symlink_attack "target root is a symlink" "."
symlink_attack ".claude is a symlink" ".claude"
symlink_attack ".cursor is a symlink" ".cursor"
symlink_attack ".ai is a symlink" ".ai"
symlink_attack ".ai/kit is a symlink" ".ai/kit"
symlink_attack ".ai/mods is a symlink" ".ai/mods"
symlink_attack ".github is a symlink" ".github"
symlink_attack ".windsurf is a symlink" ".windsurf"
symlink_attack "docs is a symlink" "docs"
symlink_attack "docs/specifications is a symlink (nested component)" "docs/specifications"
symlink_attack "docs/architecture/adr is a symlink (deep)" "docs/architecture/adr"

new_sandbox
: >"$PROJ/.claude"
run_install "$PROJ"; rc=$?
a_no "managed path occupied by a regular file is rejected (rc=$rc)" [ "$rc" -eq 0 ]

# ======================================================= 8. paths with spaces
group "target path containing spaces"
new_sandbox
SPACED="$SB/my project"
run_install "$SPACED"; rc=$?
a_ok "install into 'my project' exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
a_file "$SPACED/AGENTS.md"
a_file "$SPACED/.claude/commands/kit/feature.md"
a_ok "victim untouched (spaces test)" victim_is_empty

# ============================================================ 9. idempotency
group "repeated installs are idempotent"
new_sandbox
run_install "$PROJ" >/dev/null 2>&1
FIRST_SHA="$(sha "$PROJ/AGENTS.md")"
run_install "$PROJ"; rc=$?
a_ok "second install exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
a_ok "second install adds nothing" [ "$(grep -c '^added:' "$OUT" || true)" -eq 0 ]
if [ "$(sha "$PROJ/AGENTS.md")" = "$FIRST_SHA" ]; then pass "AGENTS.md unchanged by re-install"; else bad "AGENTS.md unchanged by re-install"; fi
a_grep "manifest exists" "manifest" "$PROJ/.ai/manifest"
a_ok "manifest has no duplicate lines" [ "$(sort "$PROJ/.ai/manifest" | uniq -d | grep -vc '^$' || true)" -eq 0 ]

new_sandbox
run_install "$PROJ" >/dev/null 2>&1
GENERIC_SHA="$(sha "$PROJ/AGENTS.md")"
run_install "$PROJ" --stack rails; rc=$?
a_ok "re-install with a different stack skips existing AGENTS.md (rc=$rc)" [ "$rc" -eq 0 ]
if [ "$(sha "$PROJ/AGENTS.md")" = "$GENERIC_SHA" ]; then pass "AGENTS.md not overwritten by stack re-install"; else bad "AGENTS.md not overwritten by stack re-install"; fi

new_sandbox
run_install "$PROJ" >/dev/null 2>&1
CORE_FILES="$(count_files "$PROJ")"
run_install "$PROJ" --runtime >/dev/null 2>&1
POST_RUNTIME="$(count_files "$PROJ")"
a_ok "--runtime after core adds only mod files" [ "$POST_RUNTIME" -gt "$CORE_FILES" ]
a_file ".ai/mods/secret-guard/hooks/register.ts"

# ================================================== 10. installed content fixes
group "installed content reflects v5 architecture"
new_sandbox
run_install "$PROJ" >/dev/null 2>&1
a_grep "AGENTS.md names push/merge/tag/release/deploy gates" "Tags & releases" "$PROJ/AGENTS.md"
a_grep "AGENTS.md gates cover migrations" "migrations" "$PROJ/AGENTS.md"
a_grep "AGENTS.md references kit CLI verify" "kit/bin/kit.js verify" "$PROJ/AGENTS.md"
a_grep "CLAUDE.md lists the six /kit: commands" "kit:feature" "$PROJ/CLAUDE.md"
a_grep "release workflow runs kit release-check" "release-check" "$PROJ/.ai/workflows/08-release.md"
a_grep "release command keeps approval gates" "approval" "$PROJ/.claude/commands/kit/release.md"
a_grep "feature command gates on kit validate-plan" "validate-plan" "$PROJ/.claude/commands/kit/feature.md"
a_grep "overview documents the three modes" "Mode A" "$PROJ/.ai/workflows/00-overview.md"
a_grep "DoD is the 11-gate table" "Verification report" "$PROJ/.ai/checklists/definition-of-done.md"
a_grep "CLAUDE.md imports AGENTS.md" "@AGENTS.md" "$PROJ/CLAUDE.md"
a_grep "installed files use .ai/ paths" "\.ai/workflows/00-overview\.md" "$PROJ/AGENTS.md"
a_grep "command text uses plain \$ARGUMENTS" 'Plan: \$ARGUMENTS|\$ARGUMENTS' "$PROJ/.claude/commands/kit/feature.md"
a_nogrep "no command uses \${ARGUMENTS:-...}" '\${ARGUMENTS' "$PROJ/.claude/commands/kit/feature.md"
a_nogrep "no leading-slash /AGENTS.md in cursor rule" '/AGENTS\.md' "$PROJ/.cursor/rules/00-core.mdc"

# every .ai/....md reference in installed markdown resolves to a real file
broken_refs=0
while IFS= read -r ref; do
  [ -e "$PROJ/$ref" ] || { broken_refs=$((broken_refs + 1)); echo "  broken ref: $ref" >&2; }
done < <(grep -rhoE '\.ai/[A-Za-z0-9_./-]+\.md' "$PROJ" --include='*.md' --include='*.mdc' 2>/dev/null | sort -u)
a_ok "all installed .ai/ references resolve (broken: $broken_refs)" [ "$broken_refs" -eq 0 ]

# ======================================================== 11. kit hygiene files
group "kit hygiene: license, README claims, CI pinning, components"
a_grep "LICENSE exists and is MIT" "MIT License" "$KIT/LICENSE"
for tool in "Claude Code" "Cursor" "Windsurf" "GitHub Copilot" "Gemini"; do
  a_grep "README documents adapter: $tool" "$tool" "$KIT/README.md"
done
a_nogrep "README does not overclaim Perplexity support" "Perplexity" "$KIT/README.md"
a_grep "CI pins actions to full commit SHAs" 'uses: actions/[a-z-]+@[0-9a-f]{40}' "$KIT/.github/workflows/check.yml"
a_grep "components.json declares the runtime component" "sdlc-runtime" "$KIT/components.json"
a_grep "CHANGELOG documents v5" "5\.0\.0" "$KIT/CHANGELOG.md"

group "Agent Skills spec compliance (agentskills.io)"
skill_failed=0
for d in "$KIT"/core/skills/*/; do
  name="$(basename -- "$d")"
  f="$d/SKILL.md"
  if [ ! -f "$f" ]; then
    bad "core/skills/$name: missing SKILL.md"
    skill_failed=1
    continue
  fi
  if ! grep -q '^name:' "$f" && ! grep -q '^name: ' "$f"; then
    bad "core/skills/$name: missing name"; skill_failed=1
  fi
  fm_name="$(sed -n 's/^name:[[:space:]]*//p' "$f" | head -1 | tr -d '"')"
  [ "$fm_name" = "$name" ] || { bad "core/skills/$name: name '$fm_name' != folder name"; skill_failed=1; }
  printf '%s' "$fm_name" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$' || { bad "core/skills/$name: invalid name syntax"; skill_failed=1; }
  [ "${#fm_name}" -le 64 ] || { bad "core/skills/$name: name > 64 chars"; skill_failed=1; }
  desc="$(sed -n 's/^description:[[:space:]]*//p' "$f" | head -1)"
  [ -n "$desc" ] || { bad "core/skills/$name: empty description"; skill_failed=1; }
  lines="$(wc -l <"$f" | tr -d ' ')"
  [ "$lines" -le 500 ] || { bad "core/skills/$name: SKILL.md has $lines lines (> 500)"; skill_failed=1; }
done
[ "$skill_failed" -eq 0 ] && pass "all skills pass spec checks (name, description, size)"

group "kit source files have no leading-slash AGENTS.md references"
for f in "$KIT"/.cursor/rules/*.mdc "$KIT"/.windsurf/rules/*.md "$KIT/.github/copilot-instructions.md" "$KIT/CLAUDE.md" "$KIT/GEMINI.md"; do
  a_nogrep "no /AGENTS.md in ${f#"$KIT"/}" '/AGENTS\.md' "$f"
done
for f in "$KIT"/core/commands/kit/*.md; do
  a_nogrep "no \${ARGUMENTS placeholders in ${f#"$KIT"/}" '\${ARGUMENTS' "$f"
done

# ============================================================ 12. uninstall
group "uninstall removes kit files, keeps user files"
new_sandbox
run_install "$PROJ" --runtime >/dev/null 2>&1
echo "user data" >"$PROJ/user-notes.txt"
echo "mine" >"$PROJ/.claude/agents/mine.md"
bash "$UNINSTALL" "$PROJ" >"$OUT" 2>&1; rc=$?
a_ok "uninstall exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
a_nofile "$PROJ/AGENTS.md"
a_nofile "$PROJ/.ai"
a_nofile "$PROJ/.github/pull_request_template.md"
a_file "$PROJ/user-notes.txt"
a_file "$PROJ/.claude/agents/mine.md"
a_ok ".claude/agents kept (not empty)" [ -d "$PROJ/.claude/agents" ]

group "uninstall dry-run removes nothing"
new_sandbox
run_install "$PROJ" >/dev/null 2>&1
bash "$UNINSTALL" "$PROJ" --dry-run >"$OUT" 2>&1; rc=$?
a_ok "dry-run exits 0 (rc=$rc)" [ "$rc" -eq 0 ]
a_file "$PROJ/AGENTS.md"
a_file "$PROJ/.ai/manifest"

group "uninstall error cases"
new_sandbox
bash "$UNINSTALL" "$PROJ" >"$OUT" 2>&1; rc=$?
a_no "uninstall without manifest fails (rc=$rc)" [ "$rc" -eq 0 ]
a_grep "explains missing manifest" "manifest" "$OUT"

new_sandbox
mkdir -p "$VICTIM/real"
ln -s "$VICTIM/real" "$PROJ/linkproj"
bash "$UNINSTALL" "$PROJ/linkproj" >"$OUT" 2>&1; rc=$?
a_no "uninstall refuses symlinked target (rc=$rc)" [ "$rc" -eq 0 ]
a_ok "victim untouched by uninstall attempt" victim_is_empty

# ================================================================ summary ==
echo
echo "================================================"
echo "Passed: $PASS   Failed: $FAIL"
echo "================================================"
if [ "$FAIL" -gt 0 ]; then
  echo "REGRESSION TESTS FAILED."
  exit 1
fi
echo "All regression tests passed."
