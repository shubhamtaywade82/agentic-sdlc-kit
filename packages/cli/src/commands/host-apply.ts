// packages/cli/src/commands/host-apply.ts
//
// Applies planned host-instruction targets to disk. Never overwrites a file
// the user edited (or one the kit did not write) unless --force is given.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { inspectManaged, upsertBlock, type HostTarget } from '@agentic-sdlc-kit/core';

export type ApplyAction = 'created' | 'updated' | 'unchanged' | 'refused';

export interface ApplyResult {
  readonly path: string;
  readonly action: ApplyAction;
  readonly reason?: string;
}

async function readOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

interface Decision {
  readonly action: ApplyAction;
  readonly next?: string;
  readonly reason?: string;
}

function decideBlock(existing: string | null, target: HostTarget): Decision {
  const next = upsertBlock(existing, target.content);
  if (existing === null) return { action: 'created', next };
  return next === existing ? { action: 'unchanged' } : { action: 'updated', next };
}

function decideFile(existing: string | null, target: HostTarget, force: boolean): Decision {
  const state = inspectManaged(existing);
  if (state === 'absent') return { action: 'created', next: target.content };
  if (existing === target.content) return { action: 'unchanged' };
  if (state === 'unmodified' || force) return { action: 'updated', next: target.content };
  const why = state === 'modified' ? 'edited since install' : 'not written by the kit';
  return { action: 'refused', reason: `${why}; re-run with --force to replace` };
}

export async function applyTarget(
  root: string,
  target: HostTarget,
  opts: { force: boolean; dryRun: boolean },
): Promise<ApplyResult> {
  const abs = path.join(root, target.path);
  const existing = await readOrNull(abs);
  const d =
    target.mode === 'block' ? decideBlock(existing, target) : decideFile(existing, target, opts.force);
  if (d.next !== undefined && !opts.dryRun) {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, d.next, 'utf8');
  }
  return { path: abs, action: d.action, ...(d.reason ? { reason: d.reason } : {}) };
}
