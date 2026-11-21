// packages/cli/src/application/agent/providers/claude-code/mod-parity.ts
//
// Runtime Mods enforcement parity (ADR-0019 PR4; ADR-0020 §2).
//
// Two enforcement points derive from ONE canonical policy:
//   1. Claude Code's own permission system — the GENERATED representation
//      (permission-config.ts) passed as session flags; enforced by Claude
//      Code regardless of anything the kit does.
//   2. The kit's runtime Mods (sdlc-guard, secret-guard, model-router,
//      run-observer) — Claude Code hook plugins the kit ships and links
//      into the PROJECT's .claude/plugins/ (plugin-linker.ts).
//
// For a Mode 1 execution the agent runs inside the run's WORKTREE, so the
// Mods must be active there too — "parity". This module links them into
// the worktree (idempotent) and reports the result HONESTLY:
//   - linked/already-linked → the second enforcement point is active;
//   - not-found/incomplete  → recorded as a note; the execution continues
//     under enforcement point 1 (which is policy-derived and always
//     present), and the summary states the Mods were NOT active.
//
// The linked .claude/plugins/ entries are runtime machinery, never project
// content: the repository's .gitignore excludes .claude/ so the run's
// evidence diff (the agent's actual footprint) stays clean.

import { linkRuntimePlugins, type PluginLinkResult } from '../../../../commands/plugin-linker.js';

export interface ModsParityResult {
  /** True when every runtime mod is linked into the workspace. */
  readonly active: boolean;
  readonly results: readonly PluginLinkResult[];
  /** Honest human-readable note for the execution record. */
  readonly note: string;
}

/**
 * Ensure the kit's runtime Mods are linked into the execution workspace.
 * Best-effort with honest reporting — see the module header for the
 * fail-open reasoning and its limits.
 */
export async function ensureRuntimeModsActive(workspaceRoot: string): Promise<ModsParityResult> {
  const results = await linkRuntimePlugins(workspaceRoot);
  const bad = results.filter((r) => r.status !== 'linked' && r.status !== 'already-linked');
  const active = bad.length === 0;
  const note = active
    ? `runtime Mods active in workspace (${results.map((r) => r.name).join(', ')})`
    : `runtime Mods NOT fully active: ${bad.map((r) => `${r.name} (${r.status})`).join('; ')} — ` +
      `the policy-derived Claude Code permission configuration remains enforced; ` +
      `kit-level Mod guards are absent for this execution`;
  return { active, results, note };
}
