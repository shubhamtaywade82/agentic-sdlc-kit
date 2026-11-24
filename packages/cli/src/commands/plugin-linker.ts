// packages/cli/src/commands/plugin-linker.ts
//
// Runtime plugin (Mod) linking for `kit install`.
//
// The kit ships four Claude Code plugins (model-router, run-observer,
// sdlc-guard, secret-guard) in `plugins/` of the kit repository. Claude Code
// discovers them via `<plugin>/.claude-plugin/plugin.json` and loads their
// hook modules from the paths declared in `hooks/hooks.json`.
//
// IMPORTANT (official docs, verified November 2026): module paths in
// hooks/hooks.json resolve relative to the hooks/ DIRECTORY (where the
// manifest lives), and Claude Code loads `.ts` hooks modules DIRECTLY —
// no build step. The shipped manifests therefore declare `./register.ts`
// (source committed in the repository), so a fresh clone validates as-is.
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
  /**
   * `conflict`: something that is not the kit's own link to this plugin
   * occupies the path (foreign or dangling symlink, real file/dir, or a
   * symlinked parent). Left untouched and never recorded as kit-owned.
   */
  status: 'linked' | 'already-linked' | 'incomplete' | 'not-found' | 'conflict';
  /** For linked/already-linked: the absolute path the link points at. */
  target?: string;
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

/**
 * Validate that the hooks module paths declared by a plugin's
 * `hooks/hooks.json` resolve to real files. Paths resolve relative to the
 * hooks/ directory — the same base the Claude Code plugin validator uses
 * (an easy mistake: relative to the plugin root the same string would point
 * one directory too high).
 */
export async function validatePluginHooks(
  pluginDir: string,
): Promise<{ ok: boolean; missing: string[] }> {
  const hooksDir = path.join(pluginDir, 'hooks');
  const manifestPath = path.join(hooksDir, 'hooks.json');
  let modules: string[] = [];
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as { modules?: unknown };
    if (Array.isArray(parsed.modules)) {
      modules = parsed.modules.filter((m): m is string => typeof m === 'string');
    }
  } catch {
    return { ok: false, missing: [manifestPath] };
  }
  if (modules.length === 0) {
    return { ok: false, missing: [`${manifestPath} (declares no hooks modules)`] };
  }
  const missing: string[] = [];
  for (const mod of modules) {
    const resolved = path.resolve(hooksDir, mod);
    try {
      await fs.access(resolved);
    } catch {
      missing.push(mod);
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Where a symlink points, resolved to an absolute path (works for dangling links). */
export async function linkTarget(linkPath: string): Promise<string> {
  return path.resolve(path.dirname(linkPath), await fs.readlink(linkPath));
}

type Occupant = 'none' | 'ours' | 'foreign';

/**
 * Classify what already sits at `linkPath`. Only a symlink that resolves to
 * this kit's own plugin directory is "ours"; a foreign or dangling symlink,
 * a real file or directory are all "foreign".
 */
async function classifyOccupant(linkPath: string, pluginDir: string): Promise<Occupant> {
  const stat = await fs.lstat(linkPath).catch(() => null);
  if (!stat) return 'none';
  if (!stat.isSymbolicLink()) return 'foreign';
  try {
    return (await fs.realpath(linkPath)) === (await fs.realpath(pluginDir)) ? 'ours' : 'foreign';
  } catch {
    return 'foreign'; // dangling
  }
}

/** A symlinked .claude or .claude/plugins would redirect every write elsewhere. */
async function symlinkedParent(projectRoot: string): Promise<string | null> {
  for (const dir of [path.join(projectRoot, '.claude'), path.join(projectRoot, '.claude', 'plugins')]) {
    if ((await fs.lstat(dir).catch(() => null))?.isSymbolicLink()) return dir;
  }
  return null;
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
  const redirected = await symlinkedParent(projectRoot);
  if (redirected !== null) {
    return RUNTIME_PLUGIN_NAMES.map((name) => ({
      name,
      linkPath: path.join(targetBase, name),
      status: 'conflict' as const,
      detail: `refusing to link: ${redirected} is a symlink, so links would land outside the project`,
    }));
  }
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

    // Validate hooks modules BEFORE linking so we never install a plugin
    // whose hook module path is broken (which is what the Claude Code
    // plugin validator would reject). The shipped manifests point at
    // TypeScript source inside the repository, so a missing module means
    // an incomplete plugin directory (bad clone, partial copy) — not a
    // missing build.
    //
    // Note: validatePluginHooks resolves module paths relative to the
    // hooks/ directory — mirroring the real Claude Code validator — so a
    // manifest that passes here also passes `claude plugin validate`.
    const hooks = await validatePluginHooks(pluginDir);
    if (!hooks.ok) {
      results.push({
        name,
        linkPath,
        status: 'incomplete',
        detail:
          `hooks module(s) ${hooks.missing.join(', ')} not found under ${pluginDir}. ` +
          'The plugin directory is incomplete — reinstall or repair the kit repository, then re-run `kit install`.',
      });
      continue;
    }

    // Idempotent linking. Only our own link counts as already linked;
    // anything else at the path is a conflict and is never adopted.
    const occupant = await classifyOccupant(linkPath, pluginDir);
    if (occupant === 'ours') {
      results.push({ name, linkPath, status: 'already-linked', target: await linkTarget(linkPath) });
      continue;
    }
    if (occupant === 'foreign') {
      results.push({
        name,
        linkPath,
        status: 'conflict',
        detail: 'path exists and is not a link to this kit plugin; left untouched and not recorded as kit-owned',
      });
      continue;
    }
    try {
      await fs.symlink(pluginDir, linkPath, 'dir');
      results.push({ name, linkPath, status: 'linked', target: await linkTarget(linkPath) });
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
