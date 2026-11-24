// packages/core/src/host-instructions/managed.ts
//
// Ownership markers for installed instruction files, so re-installing never
// clobbers a file the user edited.
//   whole files: a trailer carries the sha256 of the body; an existing file is
//     safe to replace only if it still hashes to its own trailer.
//   shared files (AGENTS.md ...): a marked block is replaced in place and all
//     surrounding user text is preserved.

import { createHash } from 'node:crypto';

export const BLOCK_BEGIN = '<!-- >>> agentic-sdlc-kit managed block >>> -->';
export const BLOCK_END = '<!-- <<< agentic-sdlc-kit managed block <<< -->';
const TRAILER = /\n?<!-- kit-managed:sha256=([0-9a-f]{64}) -->\n?$/;

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export function withTrailer(body: string): string {
  const clean = body.replace(/\n+$/, '');
  return `${clean}\n<!-- kit-managed:sha256=${sha(clean)} -->\n`;
}

export type ManagedState = 'absent' | 'unmodified' | 'modified' | 'foreign';

/** `foreign` = no trailer at all (not written by the kit); `modified` = trailer, edited body. */
export function inspectManaged(existing: string | null): ManagedState {
  if (existing === null) return 'absent';
  const m = TRAILER.exec(existing);
  if (!m) return 'foreign';
  return sha(existing.replace(TRAILER, '')) === m[1] ? 'unmodified' : 'modified';
}

export function stripBlock(text: string): string {
  const out: string[] = [];
  let skip = false;
  for (const line of text.split('\n')) {
    if (line === BLOCK_BEGIN) skip = true;
    if (!skip) out.push(line);
    if (line === BLOCK_END) skip = false;
  }
  return out.join('\n');
}

export function upsertBlock(existing: string | null, body: string): string {
  const base = stripBlock(existing ?? '').replace(/\n+$/, '');
  const block = [BLOCK_BEGIN, body.replace(/\n+$/, ''), BLOCK_END].join('\n');
  return (base ? base + '\n\n' : '') + block + '\n';
}
