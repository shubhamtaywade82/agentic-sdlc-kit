// packages/cli/src/commands/plugin-linker.ts
//
// Runtime plugin (Mod) linking for `kit install`.
//
// The kit ships four Claude Code plugins (model-router, run-observer,
// sdlc-guard, secret-guard) in `plugins/` of the kit repository. Claude Code
// discovers them via `<plugin>/.claude-plugin/plugin.json` and loads their
// hook modules from the paths declared in `hooks/hooks.json`.
//
// Hook contract (Claude Code plugin hooks, code.claude.com/docs/en/hooks):
// hooks/hooks.json uses the official `hooks` object with command handlers that
// run `node "${CLAUDE_PLUGIN_ROOT}/dist/..."`. Those dist files are produced by
// `pnpm run build`, so a plugin is linked only when its built hook entry exists.
// Plugins still on the retired `modules`/register() contract are reported as
// `not-converted` and are NOT linked: a link to a plugin Claude Code cannot load
// would show an installed guard that does nothing.
//
// This module:
//   1. Locates the kit's `plugins/` directory relative to the CLI's own
//      installed location (so it works through `pnpm link --global`).
//   2. Validates each plugin's hooks module path actually exists, resolved
//      the same way the Claude Code plugin validator resolves it (relative
//      to the hooks/ directory).
//   3. Creates idempotent symlinks in `<project>/.claude/plugins/<name>`.
//
// Per the kit's no-silent-fabrication principle: a plugin whose hooks module
// is missing is reported as a WARNING with a fix instruction, never silently
// skipped, and never reported as installed when it is not.

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_PLUGIN_NAMES = [
  'sdlc-guard',
  'secret-guard',
  'model-router',
  'run-observer',
] as const;

export interface PluginLinkResult {
  name: string;
  /** Where the symlink was created (or already existed) inside the project. */
  linkPath: string;
  status: 'linked' | 'already-linked' | 'incomplete' | 'not-found' | 'not-converted';
  detail?: string;
}

/**
 * Resolve the kit repository's `plugins/` directory from the CLI's own
 * module location. `packages/cli/dist/commands/plugin-linker.js` ->
 * `<repo>/plugins`. Returns null when the layout does not match (e.g. the
 * CLI was installed from a tarball without the plugins).
 *
 * `overrideRoot` exists for tests so they can point at a fake kit layout.
 */
export function resolveKitPluginsDir(overrideRoot?: string): string | null {
  if (overrideRoot) {
    const dir = path.join(overrideRoot, 'plugins');
    return existsSync(dir) ? dir : null;
  }
  // this file: <repo>/packages/cli/dist/commands/plugin-linker.js
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..', '..');
  const pluginsDir = path.join(repoRoot, 'plugins');
  return existsSync(pluginsDir) ? pluginsDir : null;
}

export type HooksFormat = 'command-hooks' | 'legacy-modules' | 'unreadable';

export interface HooksValidation {
  format: HooksFormat;
  ok: boolean;
  /** Built hook entries (relative to the plugin root) that do not exist. */
  missing: string[];
}

const PLUGIN_ROOT_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/g;

function commandStrings(hooks: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups as Array<{ hooks?: unknown }>) {
      if (!Array.isArray(group.hooks)) continue;
      for (const handler of group.hooks as Array<{ type?: unknown; command?: unknown }>) {
        if (handler.type === 'command' && typeof handler.command === 'string') out.push(handler.command);
      }
    }
  }
  return out;
}

/**
 * Validate a plugin's hooks/hooks.json. Every `${CLAUDE_PLUGIN_ROOT}/<path>`
 * referenced by a command handler must exist under the plugin directory.
 */
export async function validatePluginHooks(pluginDir: string): Promise<HooksValidation> {
  const manifestPath = path.join(pluginDir, 'hooks', 'hooks.json');
  let parsed: { hooks?: unknown; modules?: unknown };
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as typeof parsed;
  } catch {
    return { format: 'unreadable', ok: false, missing: [manifestPath] };
  }
  if (parsed.hooks === undefined || typeof parsed.hooks !== 'object' || parsed.hooks === null) {
    return { format: 'legacy-modules', ok: false, missing: [] };
  }
  const missing = new Set<string>();
  for (const command of commandStrings(parsed.hooks as Record<string, unknown>)) {
    for (const match of command.matchAll(PLUGIN_ROOT_PATH)) {
      const rel = match[1] as string;
      try {
        await fs.access(path.join(pluginDir, rel));
      } catch {
        missing.add(rel);
      }
    }
  }
  return { format: 'command-hooks', ok: missing.size === 0, missing: [...missing] };
}

/**
 * Link the runtime plugins into `<project>/.claude/plugins/`.
 * Never throws: every failure is reported per-plugin in the results.
 */
export async function linkRuntimePlugins(
  projectRoot: string,
  overrideKitRoot?: string,
): Promise<PluginLinkResult[]> {
  const pluginsDir = resolveKitPluginsDir(overrideKitRoot);
  const results: PluginLinkResult[] = [];

  if (!pluginsDir) {
    return RUNTIME_PLUGIN_NAMES.map((name) => ({
      name,
      linkPath: path.join(projectRoot, '.claude', 'plugins', name),
      status: 'not-found' as const,
      detail:
        'kit plugins/ directory not found next to the CLI installation. ' +
        'Link plugins manually (see docs/HOST_INTEGRATIONS.md).',
    }));
  }

  const targetBase = path.join(projectRoot, '.claude', 'plugins');
  await fs.mkdir(targetBase, { recursive: true });

  for (const name of RUNTIME_PLUGIN_NAMES) {
    const pluginDir = path.join(pluginsDir, name);
    const linkPath = path.join(targetBase, name);
    try {
      // Does the plugin source exist at all?
      await fs.access(path.join(pluginDir, '.claude-plugin', 'plugin.json'));
    } catch {
      results.push({
        name,
        linkPath,
        status: 'not-found',
        detail: `plugin source not found at ${pluginDir}`,
      });
      continue;
    }

    // Validate BEFORE linking so a plugin Claude Code cannot load is never
    // reported as installed.
    const hooks = await validatePluginHooks(pluginDir);
    if (hooks.format === 'legacy-modules') {
      results.push({
        name,
        linkPath,
        status: 'not-converted',
        detail:
          'hooks use the retired register() module contract, which Claude Code does not load. ' +
          'Not linked until converted to command hooks (see docs/HOST_INTEGRATIONS.md).',
      });
      continue;
    }
    if (hooks.format === 'unreadable') {
      results.push({
        name,
        linkPath,
        status: 'incomplete',
        detail: `hooks/hooks.json is missing or unreadable under ${pluginDir}; repair the kit repository.`,
      });
      continue;
    }
    if (!hooks.ok) {
      results.push({
        name,
        linkPath,
        status: 'incomplete',
        detail:
          `built hook entr${hooks.missing.length === 1 ? 'y' : 'ies'} ${hooks.missing.join(', ')} missing under ${pluginDir}. ` +
          'Run `pnpm run build` in the kit repository, then re-run `kit install`.',
      });
      continue;
    }

    // Idempotent linking: replace a symlink we own; keep anything else.
    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink()) {
        results.push({ name, linkPath, status: 'already-linked' });
        continue;
      }
      // A real file/dir already occupies the path: do not clobber it.
      results.push({
        name,
        linkPath,
        status: 'already-linked',
        detail: 'path already exists and is not a kit symlink; left untouched',
      });
      continue;
    } catch {
      // Path does not exist: create the symlink.
    }
    try {
      await fs.symlink(pluginDir, linkPath, 'dir');
      results.push({ name, linkPath, status: 'linked' });
    } catch (err) {
      results.push({
        name,
        linkPath,
        status: 'not-found',
        detail: `failed to create symlink: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return results;
}
