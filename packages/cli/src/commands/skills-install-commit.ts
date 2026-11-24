// packages/cli/src/commands/skills-install-commit.ts
//
// The staged-commit half of `kit skills install` (see ./skills-install.ts).
//
// Order of operations: plan (decide per skill, nothing written yet) →
// stage (copy into .ai-kit/tmp staging and validate) → commit (rename into
// place, replaced directories moved aside first). A commit failure rolls
// back everything this commit changed; if the rollback itself fails, the
// staging directory is kept for manual recovery instead of being deleted.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  type SkillInstallStatus,
  type SkillsManifest,
  ownedSkillNames,
} from './skills-install-manifest.js';
import { copyTreeSecure, validateSkillFrontmatter } from './skills-install-secure.js';

export type SkillAction = 'install' | 'skipped-existing' | 'skipped-unowned';

export interface SkillPlanEntry {
  name: string;
  action: SkillAction;
}

/** Commit-phase failure. `clean` records whether the rollback fully restored the project. */
export class CommitError extends Error {
  constructor(
    message: string,
    readonly clean: boolean,
  ) {
    super(message);
  }
}

/**
 * Decide the action per skill before anything is written. `--force` may
 * replace only directories the kit owns (manifest `installed` records for
 * this target directory); anything else that already exists is reported and
 * left untouched.
 */
export async function planSkillInstalls(
  names: readonly string[],
  targetDir: string,
  force: boolean,
  manifest: SkillsManifest,
  into: string,
): Promise<SkillPlanEntry[]> {
  const owned = ownedSkillNames(manifest, into);
  const plan: SkillPlanEntry[] = [];
  for (const name of names) {
    const dest = path.join(targetDir, name);
    const exists = await fs.access(dest).then(
      () => true,
      () => false,
    );
    if (!exists) plan.push({ name, action: 'install' });
    else if (!force) plan.push({ name, action: 'skipped-existing' });
    else if (owned.has(name)) plan.push({ name, action: 'install' });
    else plan.push({ name, action: 'skipped-unowned' });
  }
  return plan;
}

/**
 * Copy every planned skill into the staging tree and validate it there.
 * A validation failure leaves the project untouched: staging is discarded
 * by the caller.
 */
export async function stageSkills(
  skillsDir: string,
  plan: SkillPlanEntry[],
  stagingRoot: string,
): Promise<Map<string, string>> {
  const staged = new Map<string, string>();
  for (const entry of plan) {
    if (entry.action !== 'install') continue;
    const stage = path.join(stagingRoot, 'skills', entry.name);
    await copyTreeSecure(path.join(skillsDir, entry.name), stage);
    await validateSkillFrontmatter(path.join(stage, 'SKILL.md'), entry.name);
    staged.set(entry.name, stage);
  }
  return staged;
}

/**
 * Commit staged directories into the target. Replaced directories are moved
 * aside first; on failure everything the kit changed in this commit is rolled
 * back (best effort, honestly reported), so a partial install never stands.
 * If the rollback itself fails, staging is kept for manual recovery.
 */
export async function commitStagedSkills(
  staged: ReadonlyMap<string, string>,
  targetDir: string,
  stagingRoot: string,
): Promise<void> {
  const applied: string[] = [];
  const movedAside: Array<{ dest: string; backup: string }> = [];
  try {
    await fs.mkdir(targetDir, { recursive: true });
    for (const [name, stage] of staged) {
      const dest = path.join(targetDir, name);
      const exists = await fs.access(dest).then(
        () => true,
        () => false,
      );
      if (exists) {
        const backup = path.join(stagingRoot, 'backups', name);
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await fs.rename(dest, backup);
        movedAside.push({ dest, backup });
      }
      await fs.rename(stage, dest);
      applied.push(dest);
    }
  } catch (err) {
    let clean = true;
    const markDirty = (): void => {
      clean = false;
    };
    for (const dest of applied) {
      await fs.rm(dest, { recursive: true, force: true }).catch(markDirty);
    }
    for (const { dest, backup } of movedAside) {
      const present = await fs.access(dest).then(
        () => true,
        () => false,
      );
      if (!present) await fs.rename(backup, dest).catch(markDirty);
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new CommitError(
      clean
        ? `staged commit failed and was rolled back: ${detail}`
        : `staged commit failed; ROLLBACK INCOMPLETE — the staging directory ${stagingRoot} ` +
            `was kept for manual recovery: ${detail}`,
      clean,
    );
  }
}

/** Derive the manifest statuses from the plan. */
export function statusesFromPlan(plan: SkillPlanEntry[]): SkillInstallStatus[] {
  return plan.map((p) => ({
    name: p.name,
    status: p.action === 'install' ? 'installed' : p.action,
  }));
}
