// packages/cli/src/commands/skills-install-manifest.ts
//
// The skills manifest (`.ai-kit/skills-manifest.json`) is the ownership
// record for `kit skills install`: it is the only evidence of which skill
// directories the kit placed into a project, so `--force` may replace
// exactly those directories and nothing else.
//
// Reading is fail-closed: a manifest that exists but cannot be parsed is a
// hard error, never a silent reset — overwriting it with a fresh one would
// erase the ownership records of every previously installed pack.

import { promises as fs } from 'node:fs';
import { SecureInstallError } from './skills-install-secure.js';

export interface SkillInstallStatus {
  name: string;
  status: 'installed' | 'skipped-existing' | 'skipped-unowned';
}

export interface PackRecord {
  repository: string;
  url: string;
  ref: string;
  commit: string;
  into: string;
  installedAt: string;
  skills: SkillInstallStatus[];
}

export interface SkillsManifest {
  schemaVersion: 1;
  packs: Record<string, PackRecord>;
}

const RECOVERY_HINT =
  'kit refuses to overwrite a manifest it cannot read — earlier pack records would be lost.\n' +
  'Restore the file from version control, repair it by hand, or delete it to forget\n' +
  'all recorded installs and start fresh.';

const isSkillStatus = (v: unknown): v is SkillInstallStatus =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Record<string, unknown>).name === 'string' &&
  typeof (v as Record<string, unknown>).status === 'string';

const isPackRecord = (v: unknown): v is PackRecord =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Record<string, unknown>).repository === 'string' &&
  typeof (v as Record<string, unknown>).url === 'string' &&
  typeof (v as Record<string, unknown>).ref === 'string' &&
  typeof (v as Record<string, unknown>).commit === 'string' &&
  typeof (v as Record<string, unknown>).into === 'string' &&
  typeof (v as Record<string, unknown>).installedAt === 'string' &&
  Array.isArray((v as Record<string, unknown>).skills) &&
  ((v as Record<string, unknown>).skills as unknown[]).every(isSkillStatus);

/**
 * Read the skills manifest. A missing file is a fresh start; a file that
 * exists but is malformed fails closed instead of being silently reset.
 */
export async function readSkillsManifest(manifestPath: string): Promise<SkillsManifest> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return { schemaVersion: 1, packs: {} };
  }
  const where = ` (at ${manifestPath})`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SecureInstallError(`skills manifest is not valid JSON${where}\n${RECOVERY_HINT}`);
  }
  const shape = parsed as { schemaVersion?: unknown; packs?: unknown };
  const packsOk =
    typeof shape.packs === 'object' &&
    shape.packs !== null &&
    !Array.isArray(shape.packs) &&
    Object.values(shape.packs as Record<string, unknown>).every(isPackRecord);
  if (shape.schemaVersion !== 1 || !packsOk) {
    throw new SecureInstallError(
      `skills manifest has an unexpected shape${where} ` +
        `(expected schemaVersion 1 with a packs object of pack records)\n${RECOVERY_HINT}`,
    );
  }
  return parsed as SkillsManifest;
}

/**
 * Skill directories the kit previously installed into this exact target
 * directory. Only `installed` statuses count: `skipped-existing` means the
 * directory was already there (possibly user-authored) and was never touched.
 */
export function ownedSkillNames(manifest: SkillsManifest, into: string): Set<string> {
  const owned = new Set<string>();
  for (const record of Object.values(manifest.packs)) {
    if (record.into !== into) continue;
    for (const s of record.skills) {
      if (s.status === 'installed') owned.add(s.name);
    }
  }
  return owned;
}

/**
 * Merge the run's statuses with the previous record so ownership survives
 * idempotent re-runs: a skill the kit installed once stays `installed` when
 * a later no-force run merely reports it as `skipped-existing`.
 */
export function mergeOwnership(
  previous: PackRecord | undefined,
  statuses: SkillInstallStatus[],
): SkillInstallStatus[] {
  const wasInstalled = new Set(
    (previous?.skills ?? []).filter((s) => s.status === 'installed').map((s) => s.name),
  );
  return statuses.map((s) =>
    s.status === 'skipped-existing' && wasInstalled.has(s.name)
      ? { name: s.name, status: 'installed' }
      : s,
  );
}
