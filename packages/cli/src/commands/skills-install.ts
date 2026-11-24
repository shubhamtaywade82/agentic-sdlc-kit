// packages/cli/src/commands/skills-install.ts
//
// Executor for `kit skills install <pack>`. Fetches an external skills pack
// from its GitHub repository (shallow clone, default branch), copies the
// pack's `skills/*` directories into the target project, and records the
// installation in `.ai-kit/skills-manifest.json`.
//
// Failure policy (kit convention): never fabricate success. A failed clone or
// a missing skills/ directory returns exit code 1 with a fix instruction, and
// nothing is written to the project. Already-present skill directories are
// skipped unless `--force`; `--force` replaces only directories the kit
// previously installed (the manifest is the ownership record), so re-running
// is idempotent and user-authored skills are never deleted.
//
// Install path security is split across focused modules:
//   ./skills-install-secure.ts   containment, symlink refusal, frontmatter
//   ./skills-install-manifest.ts fail-closed manifest reads and ownership
//   ./skills-install-commit.ts   staged plan → validate → atomic commit

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveSkillsPack } from '@agentic-sdlc-kit/core';
import type { CommandContext, CommandResult } from './types.js';
import {
  SecureInstallError,
  assertPathSymlinkFree,
  assertSafeSkillName,
  resolveInstallTarget,
} from './skills-install-secure.js';
import {
  type PackRecord,
  type SkillsManifest,
  mergeOwnership,
  readSkillsManifest,
} from './skills-install-manifest.js';
import {
  CommitError,
  commitStagedSkills,
  planSkillInstalls,
  stageSkills,
  statusesFromPlan,
} from './skills-install-commit.js';
import { formatDryRun, formatResult } from './skills-install-report.js';

const execFileAsync = promisify(execFile);

const DEFAULT_INTO = '.claude/skills';

export interface SkillsInstallOptions {
  packId: string;
  targetRoot: string;
  into?: string;
  ref?: string;
  force: boolean;
  dryRun: boolean;
  json: boolean;
  /** Install from a local checkout of the pack instead of cloning GitHub. */
  source?: string;
}

async function clonePackSource(
  packUrl: string,
  ref: string | undefined,
  dest: string,
): Promise<string> {
  const args = ['clone', '--depth', '1', '--quiet'];
  if (ref) args.push('--branch', ref);
  args.push(packUrl, dest);
  await execFileAsync('git', args, { maxBuffer: 8 * 1024 * 1024 });
  const { stdout } = await execFileAsync('git', ['-C', dest, 'rev-parse', 'HEAD']);
  return stdout.trim();
}

/** Locate the pack source (local --source or a shallow clone) and its commit. */
async function acquireSource(
  packUrl: string,
  skillsPath: string,
  opts: SkillsInstallOptions,
): Promise<{ sourceRoot: string; commit: string; isTemp: boolean }> {
  if (opts.source) {
    const present = await fs.access(path.join(opts.source, skillsPath)).then(
      () => true,
      () => false,
    );
    if (!present) {
      throw new SecureInstallError(
        `--source directory has no '${skillsPath}/' directory: ${opts.source}`,
      );
    }
    return { sourceRoot: opts.source, commit: 'local-source', isTemp: false };
  }
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-skills-'));
  const commit = await clonePackSource(packUrl, opts.ref, sourceRoot);
  return { sourceRoot, commit, isTemp: true };
}

async function listSkillDirs(skillsDir: string): Promise<string[]> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const names: string[] = [];
  for (const e of entries) {
    if (e.isSymbolicLink()) {
      throw new SecureInstallError(
        `symlinked entry in pack skills/ (nothing installed): ${path.join(skillsDir, e.name)}`,
      );
    }
    if (!e.isDirectory()) continue;
    const hasSkillMd = await fs.access(path.join(skillsDir, e.name, 'SKILL.md')).then(
      () => true,
      () => false,
    );
    if (!hasSkillMd) continue;
    assertSafeSkillName(e.name);
    names.push(e.name);
  }
  return names.sort();
}

/** Resolve and validate the install target, or fail closed with exit 1. */
async function resolveTarget(
  opts: SkillsInstallOptions,
  into: string,
  ctx: CommandContext,
): Promise<string | null> {
  try {
    const targetDir = resolveInstallTarget(opts.targetRoot, into);
    await assertPathSymlinkFree(opts.targetRoot, targetDir);
    return targetDir;
  } catch (err) {
    if (!(err instanceof SecureInstallError)) throw err;
    ctx.stderr(`kit skills: ${err.message}\n`);
    return null;
  }
}

/** Run the install subcommand. Never throws; failures return exitCode 1. */
export async function runSkillsInstall(
  opts: SkillsInstallOptions,
  ctx: CommandContext,
): Promise<CommandResult> {
  const pack = resolveSkillsPack(opts.packId);
  if (!pack) {
    ctx.stderr(`kit skills: unknown skills pack '${opts.packId}'\n`);
    return { exitCode: 1, message: `unknown skills pack: ${opts.packId}` };
  }
  const into = opts.into ?? DEFAULT_INTO;
  const targetDir = await resolveTarget(opts, into, ctx);
  if (targetDir === null) return { exitCode: 1, message: `unsafe install target: ${into}` };
  const manifestPath = path.join(opts.targetRoot, '.ai-kit', 'skills-manifest.json');

  if (opts.dryRun) {
    const plan = {
      pack: pack.id,
      repository: pack.repository,
      ref: opts.ref ?? 'default branch',
      target: into,
      expectedSkills: pack.skillCount,
      dryRun: true,
    };
    const text = opts.json ? JSON.stringify(plan, null, 2) + '\n' : formatDryRun(plan);
    ctx.stdout(text);
    return { exitCode: 0 };
  }

  let stagingRoot = '';
  let keepStaging = false;
  try {
    let manifest: SkillsManifest;
    try {
      manifest = await readSkillsManifest(manifestPath);
    } catch (err) {
      if (!(err instanceof SecureInstallError)) throw err;
      ctx.stderr(`kit skills: ${err.message}\n`);
      return { exitCode: 1, message: 'skills manifest is unreadable' };
    }

    const { sourceRoot, commit, isTemp } = await acquireSource(pack.url, pack.skillsPath, opts);
    try {
      const skillsDir = path.join(sourceRoot, pack.skillsPath);
      const present = await fs.access(skillsDir).then(
        () => true,
        () => false,
      );
      if (!present) {
        ctx.stderr(
          `kit skills: ${pack.id} has no '${pack.skillsPath}/' directory at ${sourceRoot}\n`,
        );
        return { exitCode: 1, message: 'pack skills directory missing' };
      }
      const names = await listSkillDirs(skillsDir);
      const plan = await planSkillInstalls(names, targetDir, opts.force, manifest, into);

      const tmpRoot = path.join(opts.targetRoot, '.ai-kit', 'tmp');
      await fs.mkdir(tmpRoot, { recursive: true });
      stagingRoot = await fs.mkdtemp(path.join(tmpRoot, 'skills-'));
      const staged = await stageSkills(skillsDir, plan, stagingRoot);
      await commitStagedSkills(staged, targetDir, stagingRoot);

      const statuses = statusesFromPlan(plan);
      const previous: PackRecord | undefined = manifest.packs[pack.id];
      manifest.packs[pack.id] = {
        repository: pack.repository,
        url: pack.url,
        ref: opts.ref ?? 'default-branch',
        commit,
        into,
        installedAt: new Date().toISOString(),
        skills: mergeOwnership(previous, statuses),
      };
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      const text = opts.json
        ? JSON.stringify(
            {
              installed: true,
              pack: pack.id,
              commit,
              into,
              skills: statuses,
              manifest: '.ai-kit/skills-manifest.json',
            },
            null,
            2,
          ) + '\n'
        : formatResult(pack.id, into, statuses, '.ai-kit/skills-manifest.json');
      ctx.stdout(text);
      return { exitCode: 0 };
    } finally {
      if (isTemp && sourceRoot.startsWith(os.tmpdir())) {
        await fs.rm(sourceRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  } catch (err) {
    if (err instanceof CommitError && !err.clean) keepStaging = true;
    const detail = err instanceof Error ? err.message : String(err);
    ctx.stderr(`kit skills: failed to install '${opts.packId}': ${detail}\n`);
    return { exitCode: 1, message: `install failed: ${opts.packId}` };
  } finally {
    if (stagingRoot !== '' && !keepStaging) {
      await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
