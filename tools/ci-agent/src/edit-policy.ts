// tools/ci-agent/src/edit-policy.ts
//
// The pure half of the autofix pipeline: which files may be read as
// candidates, how proposed edits are verified against real content, and the
// last path check before a tree is written. Free of I/O so the policy is
// testable without GitHub or Ollama. autofix.ts supplies the transport.

import type { FixProposal } from './schemas.js';
import { filterEdits, pathVerdict } from './security-guards.js';

const MAX_CANDIDATE_FILES = 8;
const MAX_FILE_CHARS = 16_000;

export interface CandidateFile {
  readonly path: string;
  readonly content: string;
}

export interface AppliedEdits {
  readonly applied: FixProposal['edits'];
  readonly rejected: ReadonlyArray<{ path: string; reason: string }>;
  /** Final content per changed path (same-file edits folded in order). */
  readonly folded: ReadonlyMap<string, string>;
}

/**
 * Patchable files the failing logs mention, read at the failing revision. The
 * policy is checked before the fetch, so a denied path never reaches the API.
 */
export async function selectCandidates(
  paths: readonly string[],
  fetchContent: (path: string) => Promise<string | null>,
): Promise<CandidateFile[]> {
  const candidates: CandidateFile[] = [];
  for (const path of [...paths].sort()) {
    if (candidates.length >= MAX_CANDIDATE_FILES) break;
    if (!pathVerdict(path).allowed) continue;
    const content = await fetchContent(path);
    if (content === null) continue;
    if (content.length > MAX_FILE_CHARS) continue; // oversized: unsafe for exact-match edits
    candidates.push({ path, content });
  }
  return candidates;
}

type EditOutcome = { readonly next: string } | { readonly reason: string };

function applyOne(content: string, edit: FixProposal['edits'][number]): EditOutcome {
  const occurrences = content.split(edit.oldString).length - 1;
  if (occurrences === 0) return { reason: 'oldString not found in the file (stale proposal)' };
  if (occurrences > 1) {
    return { reason: `oldString matches ${occurrences} times — ambiguous edit refused` };
  }
  // A function replacement keeps "$&" and "$1" in the model's text literal.
  const next = content.replace(edit.oldString, () => edit.newString);
  return next === content ? { reason: 'replacement produced no change' } : { next };
}

/** Verify every policy-accepted edit against real content; fold same-file edits in order. */
export function applyEdits(proposal: FixProposal, candidates: readonly CandidateFile[]): AppliedEdits {
  const { accepted, rejected } = filterEdits(proposal.edits);
  const byPath = new Map(candidates.map((c) => [c.path, c.content] as const));
  const folded = new Map<string, string>();
  const applied: FixProposal['edits'] = [];
  const rejections: Array<{ path: string; reason: string }> = [...rejected];

  for (const edit of accepted) {
    const original = byPath.get(edit.path);
    if (original === undefined) {
      rejections.push({ path: edit.path, reason: 'file content was not available at the failing revision' });
      continue;
    }
    const outcome = applyOne(folded.get(edit.path) ?? original, edit);
    if ('reason' in outcome) {
      rejections.push({ path: edit.path, reason: outcome.reason });
      continue;
    }
    folded.set(edit.path, outcome.next);
    applied.push(edit);
  }
  return { applied, rejected: rejections, folded };
}

/**
 * Last check before a tree is written. Any path that would fail policy aborts
 * the run, so nothing partial reaches GitHub.
 */
export function assertPatchablePaths(paths: Iterable<string>): void {
  for (const path of paths) {
    const verdict = pathVerdict(path);
    if (!verdict.allowed) {
      throw new Error(`refusing to write ${JSON.stringify(path)}: ${verdict.reason ?? 'denied'}`);
    }
  }
}
