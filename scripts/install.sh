#!/usr/bin/env bash
# Agentic SDLC Kit (ai-dev-kit) — installer. v5
#
# Usage:
#   bash scripts/install.sh [target_dir] [--stack <name>] [--runtime]
#
# Components (see components.json):
#   sdlc-core + kit CLI   always installed (workflows, commands, skills,
#                         agents, templates, checklists, MCP, .ai/kit)
#   sdlc-stacks           --stack <name>: rails, rails-ts, nextjs, node-ts-lib
#   sdlc-runtime          --runtime: four Claude Code mods -> .ai/mods/
#
# Guarantees (each one is regression-tested in tests/run-tests.sh):
#   1. Never writes through a symlink. The target root and every managed
#      path component (.claude, .cursor, .ai, .github, docs, ...) are
#      verified BEFORE a single byte is written.
#   2. Never modifies pre-existing files. Kit files are staged in a private
#      temp directory and transformed there; only brand-new files are copied
#      into the target, with skip-if-exists semantics.
#   3. Creates a missing target directory when its parent exists, and fails
#      cleanly when the parent does not exist.
#   4. Records every path it adds in .ai/manifest so scripts/uninstall.sh
#      can remove exactly those paths later.
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
VERSION="5.0.0"
DEST=""
STACK=""
RUNTIME=0

usage() {
  cat <<'EOF'
Usage: bash scripts/install.sh [target_dir] [--stack <name>] [--runtime]

Install the Agentic SDLC Kit (ai-dev-kit) into target_dir (default: the
current directory). Existing files are never overwritten or modified.

Components:
  sdlc-core + kit CLI   installed by default
  --stack NAME          stack pack: rails, rails-ts, nextjs, node-ts-lib
  --stack=NAME          same as --stack NAME
  --runtime             Claude Code mods (sdlc-guard, model-router,
                        secret-guard, run-observer) -> .ai/mods/
                        (requires Claude Code >= 2.1.287; load with
                        claude --plugin-dir .ai/mods/<name>)
  -h, --help            Show this help

Exit status: 0 on success, 1 on error, 2 on usage error.
EOF
}

die() { echo "install: error: $*" >&2; exit 1; }

# ------------------------------------------------------------ arguments ---
while [ $# -gt 0 ]; do
  case "$1" in
    --stack)
      [ $# -ge 2 ] || { echo "install: error: --stack needs a value" >&2; usage >&2; exit 2; }
      STACK="$2"; shift 2
      ;;
    --stack=*)
      STACK="${1#*=}"; shift
      ;;
    --runtime)
      RUNTIME=1; shift
      ;;
    -h|--help)
      usage; exit 0
      ;;
    -*)
      echo "install: error: unknown option: $1" >&2; usage >&2; exit 2
      ;;
    *)
      if [ -n "$DEST" ]; then
        echo "install: error: unexpected extra argument: $1" >&2; usage >&2; exit 2
      fi
      DEST="$1"; shift
      ;;
  esac
done
[ -n "$DEST" ] || DEST="."

if [ -n "$STACK" ] && [ ! -d "$KIT/stacks/$STACK" ]; then
  AVAILABLE=""
  for d in "$KIT"/stacks/*/; do
    [ -e "$d/AGENTS.md" ] || continue
    AVAILABLE="$AVAILABLE ${d##*/}"
  done
  die "unknown stack '$STACK' (available:$AVAILABLE)"
fi

# ---------------------------------------------------------- destination ---
# Resolve DEST to an absolute physical path. Create DEST when missing, as
# long as its parent exists. A symlinked target root is rejected up front.
if [ -L "$DEST" ]; then
  die "target '$DEST' is a symlink; refusing to install through it"
fi
if [ -e "$DEST" ]; then
  [ -d "$DEST" ] || die "target '$DEST' exists and is not a directory"
  DEST="$(cd "$DEST" && pwd -P)"
else
  PARENT="$(dirname -- "$DEST")"
  if [ -e "$PARENT" ]; then
    [ -d "$PARENT" ] || die "parent '$PARENT' of '$DEST' is not a directory"
    PARENT="$(cd "$PARENT" && pwd -P)"
  else
    die "target '$DEST' does not exist and parent '$PARENT' does not exist; create the parent directory first"
  fi
  DEST="$PARENT/$(basename -- "$DEST")"
  mkdir "$DEST"
fi

# ---------------------------------------------------------------- safety ---
# Every subpath the installer may create or write into is walked component
# by component. A symlink anywhere on the path aborts the whole install
# before anything is written (Critical finding from the v3 review).
MANAGED_SUBDIRS=(
  ".claude/agents"
  ".claude/commands/kit"
  ".claude/skills"
  ".cursor/rules"
  ".windsurf/rules"
  ".github"
  ".ai"
  ".ai/kit"
  ".ai/mods"
  ".ai/state"
  ".ai/reports"
  "docs/product"
  "docs/specifications/features"
  "docs/specifications/technical"
  "docs/plans"
  "docs/architecture/adr"
  "docs/testing"
  "docs/security/threat-models"
  "docs/releases"
)

walk() { # walk <subpath> <verify|create> [record-file]
  local sub="$1" mode="$2" record="${3:-}" cur="$DEST" part
  local parts=()
  IFS='/' read -r -a parts <<< "$sub"
  for part in "${parts[@]}"; do
    [ -n "$part" ] || continue
    cur="$cur/$part"
    case "$cur" in
      "$DEST"/*) ;; # stays inside the target
      *) die "internal error: path escapes target: $cur" ;;
    esac
    if [ "$mode" = "verify" ]; then
      if [ -L "$cur" ]; then
        die "refusing to install: '$cur' is a symlink; kit files must stay inside '$DEST'"
      fi
      if [ -e "$cur" ] && [ ! -d "$cur" ]; then
        die "refusing to install: '$cur' exists and is not a directory"
      fi
    else
      if [ -d "$cur" ]; then
        continue
      fi
      mkdir "$cur"
      if [ -n "$record" ]; then
        printf '%s\n' "${cur#"$DEST"/}" >>"$record"
      fi
    fi
  done
}

# Phase 1: verify ALL managed paths before writing anything.
for sub in "${MANAGED_SUBDIRS[@]}"; do
  walk "$sub" verify
done

# --------------------------------------------------------------- staging ---
# Build the entire installed tree in a private temp directory first. Path
# rewriting happens HERE, on kit copies only — pre-existing files in the
# target are never read, rewritten, or touched (High finding from review).
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ai-dev-kit-install.XXXXXX")"
RECORD="$(mktemp "${TMPDIR:-/tmp}/ai-dev-kit-record.XXXXXX")"
trap 'rm -rf "$STAGE" "$RECORD"' EXIT

# Phase 2: create verified directories, recording new ones for the manifest.
for sub in "${MANAGED_SUBDIRS[@]}"; do
  walk "$sub" create "$RECORD"
done

# --- sdlc-core -------------------------------------------------------------
if [ -n "$STACK" ]; then
  cp -- "$KIT/stacks/$STACK/AGENTS.md" "$STAGE/AGENTS.md"
else
  cp -- "$KIT/AGENTS.md" "$STAGE/AGENTS.md"
fi
cp -- "$KIT/CLAUDE.md" "$STAGE/CLAUDE.md"
cp -- "$KIT/GEMINI.md" "$STAGE/GEMINI.md"

mkdir -p -- "$STAGE/.github" "$STAGE/.cursor/rules" "$STAGE/.windsurf/rules" \
           "$STAGE/.claude/agents" "$STAGE/.claude/commands/kit" "$STAGE/.claude/skills"
cp -- "$KIT/.github/copilot-instructions.md" "$STAGE/.github/copilot-instructions.md"
cp -- "$KIT/core/templates/PR.md" "$STAGE/.github/pull_request_template.md"
cp -- "$KIT"/.cursor/rules/*.mdc "$STAGE/.cursor/rules/"
cp -- "$KIT"/.windsurf/rules/*.md "$STAGE/.windsurf/rules/"
cp -- "$KIT"/core/agents/*.md "$STAGE/.claude/agents/"
cp -- "$KIT"/core/commands/kit/*.md "$STAGE/.claude/commands/kit/"
if [ -n "$STACK" ] && [ -d "$KIT/stacks/$STACK/.cursor/rules" ]; then
  cp -- "$KIT/stacks/$STACK"/.cursor/rules/*.mdc "$STAGE/.cursor/rules/"
fi
for d in workflows prompts templates checklists; do
  mkdir -p -- "$STAGE/.ai/$d"
  cp -- "$KIT/core/$d"/*.md "$STAGE/.ai/$d/"
done
# Kit documentation ships into the project too, so the installed kit is
# self-contained (tool setup, MCP guide, skills guide).
mkdir -p -- "$STAGE/.ai/docs"
cp -- "$KIT"/core/docs/*.md "$STAGE/.ai/docs/"
for s in "$KIT"/core/skills/*/; do
  cp -R -- "$s" "$STAGE/.claude/skills/$(basename -- "$s")"
done

# --- kit CLI (prebuilt, zero runtime deps) ---------------------------------
mkdir -p -- "$STAGE/.ai/kit/bin" "$STAGE/.ai/kit/dist"
cp -- "$KIT/cli/bin/kit.js" "$STAGE/.ai/kit/bin/kit.js"
cp -- "$KIT/cli/package.json" "$STAGE/.ai/kit/package.json"
cp -- "$KIT/cli/README.md" "$STAGE/.ai/kit/README.md"
cp -- "$KIT"/cli/dist/*.js "$STAGE/.ai/kit/dist/"
chmod +x "$STAGE/.ai/kit/bin/kit.js"

# --- MCP server source + recipes (inert until the user builds it) ----------
# Stage selectively: never drag node_modules/ or build/ from a dev checkout.
mkdir -p -- "$STAGE/.ai/mcp/server"
cp -- "$KIT/core/mcp/README.md" "$KIT/core/mcp/.mcp.json.example" "$STAGE/.ai/mcp/"
cp -- "$KIT/core/mcp/server/package.json" "$KIT/core/mcp/server/tsconfig.json" "$STAGE/.ai/mcp/server/"
if [ -f "$KIT/core/mcp/server/package-lock.json" ]; then
  cp -- "$KIT/core/mcp/server/package-lock.json" "$STAGE/.ai/mcp/server/"
fi
cp -R -- "$KIT/core/mcp/server/src" "$STAGE/.ai/mcp/server/src"

# --- sdlc-stacks -----------------------------------------------------------
if [ -n "$STACK" ]; then
  mkdir -p -- "$STAGE/.ai/stack/$STACK"
  cp -- "$KIT/stacks/$STACK/AGENTS.md" "$STAGE/.ai/stack/$STACK/AGENTS.md"
  if [ -d "$KIT/stacks/$STACK/patterns" ]; then
    cp -R -- "$KIT/stacks/$STACK/patterns" "$STAGE/.ai/stack/$STACK/patterns"
  fi
fi

# --- sdlc-runtime docs (always shipped; mods themselves are opt-in) --------
mkdir -p -- "$STAGE/.ai/mods"
cp -- "$KIT/runtime/README.md" "$STAGE/.ai/mods/README.md"

# --- sdlc-runtime mods (Claude Code, opt-in) -------------------------------
if [ "$RUNTIME" -eq 1 ]; then
  for mod in sdlc-guard model-router secret-guard run-observer; do
    mkdir -p -- "$STAGE/.ai/mods/$mod"
    cp -R -- "$KIT/runtime/$mod/.claude-plugin" "$STAGE/.ai/mods/$mod/.claude-plugin"
    cp -R -- "$KIT/runtime/$mod/hooks" "$STAGE/.ai/mods/$mod/hooks"
    cp -R -- "$KIT/runtime/$mod/policies" "$STAGE/.ai/mods/$mod/policies"
    cp -R -- "$KIT/runtime/$mod/tests" "$STAGE/.ai/mods/$mod/tests"
    cp -- "$KIT/runtime/$mod/README.md" "$STAGE/.ai/mods/$mod/README.md"
  done
fi

# --- documentation skeleton -------------------------------------------------
for d in docs/product docs/specifications/features docs/specifications/technical \
         docs/plans docs/architecture/adr docs/testing docs/security/threat-models docs/releases; do
  mkdir -p -- "$STAGE/$d"
  : >"$STAGE/$d/.gitkeep"
done

# Rewrite kit-relative references to their installed locations. Staged
# copies only — the target's pre-existing files are never touched.
rewrite() {
  sed -i.bak -E 's#(^|[^./])(workflows|prompts|templates|checklists)/#\1.ai/\2/#g' "$1"
  rm -f "$1.bak"
}
for f in "$STAGE/AGENTS.md" "$STAGE/CLAUDE.md" "$STAGE/GEMINI.md" \
         "$STAGE"/.claude/agents/*.md "$STAGE"/.claude/commands/kit/*.md \
         "$STAGE"/.cursor/rules/*.mdc "$STAGE"/.windsurf/rules/*.md \
         "$STAGE"/.claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  rewrite "$f"
done

# --------------------------------------------------------------- install ---
ADDED=0
SKIPPED=0

install_file() { # <abs-src> <rel-dst> — never overwrite, never through a symlink
  local src="$1"
  local rel="$2"
  local dst="$DEST/$rel"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    SKIPPED=$((SKIPPED + 1))
    echo "skip (exists): $rel"
    return 0
  fi
  cp -- "$src" "$dst"
  ADDED=$((ADDED + 1))
  printf '%s\n' "$rel" >>"$RECORD"
  echo "added: $rel"
}

copy_tree() { # <abs-src-dir> <rel-prefix>
  local dir="$1" rel="$2" entry name r
  for entry in "$dir"/*; do
    name="${entry##*/}"
    r="${rel:+$rel/}$name"
    if [ -d "$entry" ] && [ ! -L "$entry" ]; then
      walk "$r" verify
      walk "$r" create "$RECORD"
      copy_tree "$entry" "$r"
    else
      install_file "$entry" "$r"
    fi
  done
}

shopt -s dotglob nullglob
copy_tree "$STAGE" ""
shopt -u dotglob nullglob

# The manifest tracks itself so uninstall can remove it (idempotent on re-install).
printf '%s\n' ".ai/manifest" >>"$RECORD"

# --------------------------------------------------------------- manifest ---
MANIFEST="$DEST/.ai/manifest"
TMPMANIFEST="$DEST/.ai/.manifest.tmp"
{
  echo "# ai-dev-kit install manifest v$VERSION — used by scripts/uninstall.sh. Do not edit."
  if [ -f "$MANIFEST" ]; then
    sed -e '/^#/d' -e '/^$/d' "$MANIFEST" || true
  fi
  cat -- "$RECORD"
} | LC_ALL=C sort -u >"$TMPMANIFEST"
mv -- "$TMPMANIFEST" "$MANIFEST"

# --------------------------------------------------------------- summary ---
echo
echo "Installed ai-dev-kit v$VERSION (Agentic SDLC Kit) into: $DEST"
echo "  files added:   $ADDED"
echo "  files skipped: $SKIPPED (existing files were left untouched)"
[ -n "$STACK" ] && echo "  stack pack:    $STACK (.ai/stack/$STACK)"
[ "$RUNTIME" -eq 1 ] && echo "  runtime mods:  sdlc-guard, model-router, secret-guard, run-observer (.ai/mods)"
if [ "$ADDED" -eq 0 ]; then
  echo "Nothing new was installed — the kit is already fully present."
fi
echo
echo "Next steps:"
echo "  1. Create the project profile:  node .ai/kit/bin/kit.js init   (or /kit:init)"
echo "  2. Review '# ADJUST' lines in AGENTS.md; per-tool notes: .ai/docs/TOOL_SETUP.md"
echo "  3. Workflow entry points (Claude Code): /kit:feature /kit:app /kit:fix /kit:review /kit:release"
echo "  4. Gates run anywhere: node .ai/kit/bin/kit.js {doctor,verify,audit,release-check}"
if [ "$RUNTIME" -eq 1 ]; then
  echo "  5. Mods (Claude Code >= 2.1.287): claude --plugin-dir .ai/mods/sdlc-guard (per mod;"
  echo "     or CLAUDE_CODE_PLUGIN_DIRS=\":.ai/mods/sdlc-guard:.ai/mods/secret-guard\") — see .ai/mods/README.md"
else
  echo "  5. Optional runtime governance: re-run with --runtime (Claude Code mods)"
fi
echo "  6. Optional MCP servers: .ai/mcp/README.md and .ai/mcp/.mcp.json.example"
