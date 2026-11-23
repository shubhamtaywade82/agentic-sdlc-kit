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
// skipped unless --force, so re-running is idempotent.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveSkillsPack } from '@agentic-sdlc-kit/core';
import type { CommandContext, CommandResult } from './types.js';

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

export interface SkillInstallStatus {
  name: string;
  status: 'installed' | 'skipped-existing';
}

interface PackRecord {
  repository: string;
  url: string;
  ref: string;
  commit: string;
  into: string;
  installedAt: string;
  skills: SkillInstallStatus[];
}

interface SkillsManifest {
  schemaVersion: 1;
  packs: Record<string, PackRecord>;
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

async function listSkillDirs(skillsDir: string): Promise<string[]> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const names: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const hasSkillMd = await fs.access(path.join(skillsDir, e.name, 'SKILL.md')).then(
      () => true,
      () => false,
    );
    if (hasSkillMd) names.push(e.name);
  }
  return names.sort();
}

async function copySkills(
  sourceSkillsDir: string,
  targetDir: string,
  force: boolean,
): Promise<SkillInstallStatus[]> {
  const names = await listSkillDirs(sourceSkillsDir);
  const statuses: SkillInstallStatus[] = [];
  await fs.mkdir(targetDir, { recursive: true });
  for (const name of names) {
    const dest = path.join(targetDir, name);
    const exists = await fs.access(dest).then(
      () => true,
      () => false,
    );
    if (exists && !force) {
      statuses.push({ name, status: 'skipped-existing' });
      continue;
    }
    if (exists && force) {
      await fs.rm(dest, { recursive: true, force: true });
    }
    await fs.cp(path.join(sourceSkillsDir, name), dest, { recursive: true });
    statuses.push({ name, status: 'installed' });
  }
  return statuses;
}

async function readManifest(manifestPath: string): Promise<SkillsManifest> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as SkillsManifest;
    if (parsed && parsed.schemaVersion === 1 && parsed.packs) return parsed;
  } catch {
    // Missing or malformed manifest: start fresh (skills install owns only
    // its own packs record; kit install owns the ownership manifest).
  }
  return { schemaVersion: 1, packs: {} };
}

function formatResult(
  packName: string,
  into: string,
  statuses: SkillInstallStatus[],
  manifestPath: string,
): string {
  const installed = statuses.filter((s) => s.status === 'installed');
  const skipped = statuses.filter((s) => s.status === 'skipped-existing');
  const lines: string[] = [`kit skills install: SUCCESS (${packName})`];
  lines.push(`  Target:       ${into}`);
  lines.push(`  Installed:    ${installed.length} skill(s)`);
  for (const s of installed) lines.push(`    + ${s.name}`);
  if (skipped.length > 0) {
    lines.push(`  Skipped:      ${skipped.length} existing skill(s) (use --force to overwrite)`);
    for (const s of skipped) lines.push(`    ~ ${s.name}`);
  }
  lines.push(`  Manifest:     ${manifestPath}`);
  lines.push('');
  return lines.join('\n');
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
  const targetDir = path.join(opts.targetRoot, into);
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

  let sourceRoot = '';
  let commit = '';
  try {
    if (opts.source) {
      const present = await fs.access(path.join(opts.source, pack.skillsPath)).then(
        () => true,
        () => false,
      );
      if (!present) {
        ctx.stderr(
          `kit skills: --source directory has no '${pack.skillsPath}/' directory: ${opts.source}\n`,
        );
        return { exitCode: 1, message: 'source skills directory missing' };
      }
      sourceRoot = opts.source;
      commit = 'local-source';
    } else {
      sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-skills-'));
      commit = await clonePackSource(pack.url, opts.ref, sourceRoot);
    }
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
    const statuses = await copySkills(skillsDir, targetDir, opts.force);
    const manifest = await readManifest(manifestPath);
    manifest.packs[pack.id] = {
      repository: pack.repository,
      url: pack.url,
      ref: opts.ref ?? 'default-branch',
      commit,
      into,
      installedAt: new Date().toISOString(),
      skills: statuses,
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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    ctx.stderr(`kit skills: failed to install '${opts.packId}': ${detail}\n`);
    return { exitCode: 1, message: `install failed: ${opts.packId}` };
  } finally {
    if (!opts.source && sourceRoot !== '' && sourceRoot.startsWith(os.tmpdir())) {
      await fs.rm(sourceRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

interface DryRunPlan {
  pack: string;
  repository: string;
  ref: string;
  target: string;
  expectedSkills: number;
  dryRun: boolean;
}

function formatDryRun(plan: DryRunPlan): string {
  const lines: string[] = [
    'kit skills install --dry-run',
    `  Pack:         ${plan.pack}`,
    `  Repository:   ${plan.repository}`,
    `  Ref:          ${plan.ref}`,
    `  Target:       ${plan.target}`,
    `  Expected:     ${plan.expectedSkills} skill(s) from pack metadata`,
    '',
    'No files written and no repository cloned. Run without --dry-run to execute.',
    '',
  ];
  return lines.join('\n');
}
