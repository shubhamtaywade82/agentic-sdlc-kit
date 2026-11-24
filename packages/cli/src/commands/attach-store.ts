// packages/cli/src/commands/attach-store.ts
//
// Filesystem operations for `kit attach local|global|detach`.

import { createHash } from 'node:crypto';
import { promises as fs, type Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MANAGED_PATHS: readonly string[] = [
  '.ai-kit',
  '.claude',
  'docs/specifications',
  'docs/plans',
];

export class AttachError extends Error {}

export function storeDirFor(root: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = env['KIT_ATTACH_HOME'] ?? path.join(os.homedir(), '.agentic-sdlc', 'projects');
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 8);
  return path.join(base, `${path.basename(root)}-${hash}`);
}

export const storeBase = (storeDir: string): string => path.dirname(storeDir);

async function lstatOrNull(p: string): Promise<Stats | null> {
  try {
    return await fs.lstat(p);
  } catch {
    return null;
  }
}

export async function attachLocal(root: string): Promise<void> {
  for (const rel of MANAGED_PATHS) {
    const abs = path.join(root, rel);
    if ((await lstatOrNull(abs))?.isSymbolicLink()) {
      throw new AttachError(`'${rel}' is a symlink; run 'kit attach detach' before switching modes`);
    }
    await fs.mkdir(abs, { recursive: true });
  }
}

async function linkOne(root: string, storeDir: string, rel: string, adopt: boolean): Promise<void> {
  const abs = path.join(root, rel);
  const target = path.join(storeDir, rel);
  await fs.mkdir(target, { recursive: true });
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const st = await lstatOrNull(abs);
  if (st?.isSymbolicLink()) {
    if ((await fs.readlink(abs)) !== target) {
      throw new AttachError(`'${rel}' points elsewhere; refusing to touch it`);
    }
    return;
  }
  if (st) await migrateExisting(abs, target, rel, adopt);
  await fs.symlink(target, abs, 'dir');
}

async function migrateExisting(abs: string, target: string, rel: string, adopt: boolean): Promise<void> {
  const st = await fs.lstat(abs);
  if (!st.isDirectory()) throw new AttachError(`'${rel}' exists and is not a directory`);
  if ((await fs.readdir(abs)).length > 0) {
    if (!adopt) {
      throw new AttachError(`'${rel}' has content; re-run with --adopt to migrate it into the store`);
    }
    await fs.cp(abs, target, { recursive: true });
  }
  await fs.rm(abs, { recursive: true, force: true });
}

export async function attachGlobal(root: string, storeDir: string, adopt: boolean): Promise<void> {
  // Preflight so a refusal on a later path cannot leave a half-attached repo.
  for (const rel of MANAGED_PATHS) await preflight(path.join(root, rel), rel, adopt);
  for (const rel of MANAGED_PATHS) await linkOne(root, storeDir, rel, adopt);
}

async function preflight(abs: string, rel: string, adopt: boolean): Promise<void> {
  const st = await lstatOrNull(abs);
  if (!st || st.isSymbolicLink()) return;
  if (!st.isDirectory()) throw new AttachError(`'${rel}' exists and is not a directory`);
  if (!adopt && (await fs.readdir(abs)).length > 0) {
    throw new AttachError(`'${rel}' has content; re-run with --adopt to migrate it into the store`);
  }
}

export async function detachLinks(root: string, base: string): Promise<string[]> {
  const removed: string[] = [];
  for (const rel of MANAGED_PATHS) {
    const abs = path.join(root, rel);
    if (!(await lstatOrNull(abs))?.isSymbolicLink()) continue;
    const dest = await fs.readlink(abs);
    if (!dest.startsWith(base + path.sep)) continue; // not ours
    await fs.unlink(abs);
    removed.push(rel);
  }
  return removed;
}

export async function describePath(root: string, rel: string): Promise<string> {
  const abs = path.join(root, rel);
  const st = await lstatOrNull(abs);
  if (!st) return `${rel} (absent)`;
  if (st.isSymbolicLink()) return `${rel} -> ${await fs.readlink(abs)} (global)`;
  return `${rel} (local dir)`;
}
