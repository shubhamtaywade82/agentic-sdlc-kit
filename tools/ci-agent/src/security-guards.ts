// tools/ci-agent/src/security-guards.ts
//
// The bounded-write policy (README invariant 4): the autofix agent may only
// patch source under packages/<pkg>/src/** and is hard-denied on workflow,
// manifest, lockfile, config, and host-instruction files — regardless of
// what the model proposes. Paths are judged in canonical form and refused
// when they are not already canonical. Normalizing them first would let
// "packages/x/src/../../../.github/..." pass as source while the GitHub API
// receives the unnormalized name.

import type { FixProposal } from './schemas.js';
import { MAX_EDIT_BYTES, MAX_EDIT_FILES, MAX_TOTAL_EDITS } from './schemas.js';

/** Plain relative POSIX path of ordinary name characters, at most 256 long. */
const CANONICAL_PATH = /^[A-Za-z0-9._/-]{1,256}$/;

interface DenyRule {
  readonly matches: (lowercasedSegment: string) => boolean;
  readonly reason: string;
}

// Applied to every segment, so a denied name is denied at any depth.
const DENY: readonly DenyRule[] = [
  { matches: (s) => s === '.github', reason: 'workflow and CI policy files' },
  { matches: (s) => s === 'package.json', reason: 'package manifests' },
  { matches: (s) => /^(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(s), reason: 'lockfiles' },
  { matches: (s) => s === 'pnpm-workspace.yaml', reason: 'workspace definition' },
  { matches: (s) => /^tsconfig[^/]*\.json$/.test(s), reason: 'TypeScript configs' },
  { matches: (s) => s.startsWith('.env'), reason: 'environment files' },
  {
    matches: (s) => /eslint\.config\.|\.prettierrc|\.editorconfig|biome\.json|oxlint/.test(s),
    reason: 'lint/format configs',
  },
  { matches: (s) => /^(?:agents|gemini|claude)\.md$/.test(s), reason: 'host instruction files' },
];

export interface PathVerdict {
  readonly allowed: boolean;
  readonly reason?: string;
}

const refuse = (reason: string): PathVerdict => ({ allowed: false, reason });

/** Decides whether a proposed path may be patched. Pure; never normalizes. */
export function pathVerdict(path: string): PathVerdict {
  if (!CANONICAL_PATH.test(path)) {
    return refuse('non-canonical path: only [A-Za-z0-9._/-], at most 256 characters');
  }
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return refuse('non-canonical path: empty, "." or ".." segment');
  }
  const lowered = segments.map((s) => s.toLowerCase());
  for (const rule of DENY) {
    if (lowered.some((s) => rule.matches(s))) return refuse(`denied: ${rule.reason}`);
  }
  const inSource = segments.length >= 4 && segments[0] === 'packages' && segments[2] === 'src';
  return inSource ? { allowed: true } : refuse('outside packages/<pkg>/src/**');
}

export interface EditRejection {
  readonly path: string;
  readonly reason: string;
}

export interface EditFilter {
  readonly accepted: FixProposal['edits'];
  readonly rejected: readonly EditRejection[];
}

/** Apply the full bounded-write policy to a proposed set of edits. */
export function filterEdits(edits: FixProposal['edits']): EditFilter {
  const accepted: FixProposal['edits'] = [];
  const rejected: EditRejection[] = [];
  const filesSeen = new Set<string>();

  for (const edit of edits) {
    const verdict = pathVerdict(edit.path);
    if (!verdict.allowed) {
      rejected.push({ path: edit.path, reason: verdict.reason ?? 'denied' });
      continue;
    }
    if (edit.oldString.length > MAX_EDIT_BYTES) {
      rejected.push({ path: edit.path, reason: `oldString exceeds ${MAX_EDIT_BYTES} bytes` });
      continue;
    }
    if (edit.newString.length > MAX_EDIT_BYTES) {
      rejected.push({ path: edit.path, reason: `newString exceeds ${MAX_EDIT_BYTES} bytes` });
      continue;
    }
    if (edit.oldString === edit.newString) {
      rejected.push({ path: edit.path, reason: 'no-op patch (oldString equals newString)' });
      continue;
    }
    if (accepted.length >= MAX_TOTAL_EDITS) {
      rejected.push({ path: edit.path, reason: `more than ${MAX_TOTAL_EDITS} total edits` });
      continue;
    }
    filesSeen.add(edit.path);
    if (filesSeen.size > MAX_EDIT_FILES) {
      rejected.push({ path: edit.path, reason: `more than ${MAX_EDIT_FILES} files` });
      continue;
    }
    accepted.push(edit);
  }
  return { accepted, rejected };
}
