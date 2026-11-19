#!/usr/bin/env bash
# AI Dev Kit — uninstaller.
#
# Usage:
#   bash scripts/uninstall.sh [target_dir] [--dry-run]
#
# Removes exactly what scripts/install.sh recorded in .ai/manifest.
# Safety rules:
#   - never follows symlinks (a listed path that is a symlink aborts)
#   - never removes directories that still contain other files
#   - refuses manifest entries that try to escape the project (.. or absolute)
set -euo pipefail

DEST=""
DEST_SET=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: bash scripts/uninstall.sh [target_dir] [--dry-run]

Remove the files the AI Dev Kit installer added to target_dir, based on
.ai/manifest. Files not in the manifest are never touched.

Options:
  -n, --dry-run   Print what would be removed, change nothing
  -h, --help      Show this help

Exit status: 0 on success, 1 on error, 2 on usage error.
EOF
}

die() { echo "uninstall: error: $*" >&2; exit 1; }

# ------------------------------------------------------------ arguments ---
while [ $# -gt 0 ]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    -*)
      echo "uninstall: error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [ -n "$DEST_SET" ]; then
        echo "uninstall: error: unexpected extra argument: $1" >&2; usage >&2; exit 2
      fi
      DEST="$1"; DEST_SET=1; shift ;;
  esac
done
[ -n "$DEST" ] || DEST="."

if [ -L "$DEST" ]; then
  die "target '$DEST' is a symlink; refusing to uninstall through it"
fi
[ -e "$DEST" ] || die "target '$DEST' does not exist"
[ -d "$DEST" ] || die "target '$DEST' is not a directory"
DEST="$(cd "$DEST" && pwd -P)"

MANIFEST="$DEST/.ai/manifest"
[ -f "$MANIFEST" ] || die "no .ai/manifest in '$DEST' — the AI Dev Kit installer did not record anything here"

# -------------------------------------------------------------- classify ---
# Split manifest entries into files and directories; refuse unsafe or
# symlinked entries before deleting anything.
FILES="$(mktemp "${TMPDIR:-/tmp}/ai-dev-kit-files.XXXXXX")"
DIRS="$(mktemp "${TMPDIR:-/tmp}/ai-dev-kit-dirs.XXXXXX")"
trap 'rm -f "$FILES" "$DIRS"' EXIT

while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  case "$line" in
    /*|*..*) die "manifest contains an unsafe path '$line' — aborting" ;;
  esac
  if [ -L "$DEST/$line" ]; then
    die "'$line' is a symlink (was it replaced after install?) — remove it manually"
  fi
  if [ -d "$DEST/$line" ]; then
    printf '%s\n' "$line" >>"$DIRS"
  else
    printf '%s\n' "$line" >>"$FILES"
  fi
done <"$MANIFEST"

# --------------------------------------------------------------- remove ---
say() { if [ "$DRY_RUN" -eq 1 ]; then echo "would remove: $*"; else echo "removed: $*"; fi; }

removed=0
kept=0

while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ -f "$DEST/$f" ]; then
    if [ "$DRY_RUN" -eq 0 ]; then rm -f -- "$DEST/$f"; fi
    say "$f"
    removed=$((removed + 1))
  else
    echo "  note: '$f' listed but already gone" >&2
  fi
done <"$FILES"

# Deepest directories first, so parents become empty in order.
while IFS= read -r d; do
  [ -n "$d" ] || continue
  if [ ! -d "$DEST/$d" ]; then continue; fi
  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -z "$(ls -A "$DEST/$d")" ]; then
      say "$d/"; removed=$((removed + 1))
    else
      echo "  note: would keep '$d/' (not empty — it holds files the kit did not install)" >&2
      kept=$((kept + 1))
    fi
  elif rmdir "$DEST/$d" 2>/dev/null; then
    say "$d/"
    removed=$((removed + 1))
  else
    echo "  note: keeping '$d/' (not empty — it holds files the kit did not install)" >&2
    kept=$((kept + 1))
  fi
done < <(awk -F/ '{print NF, $0}' "$DIRS" | sort -rn | cut -d' ' -f2-)

# Finally remove the manifest itself and .ai when it is now empty.
# (Older manifests did not list themselves; this keeps uninstall complete.)
if [ "$DRY_RUN" -eq 0 ]; then
  rm -f -- "$MANIFEST"
  rmdir "$DEST/.ai" 2>/dev/null || true
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Dry run — nothing was removed ($removed paths would be removed)."
else
  echo
  echo "Uninstalled ai-dev-kit from: $DEST"
  echo "  paths removed: $removed"
  if [ "$kept" -gt 0 ]; then
    echo "  directories kept (not empty): $kept"
  fi
fi
