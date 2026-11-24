// tools/ci-agent/src/security-guards.ts
//
// The bounded-write policy (README invariant 4): the autofix agent may only
// patch source under packages/<pkg>/src/** and is hard-denied on workflow,
// manifest, lockfile, config, and host-instruction files — regardless of
// what the model proposes. Path edits are also capped (max 5 files, max 8
// edits, 60 KB per side, no-op patches dropped).

import type { FixProposal } from './schemas.js';
import { MAX_EDIT_BYTES, MAX_EDIT_FILES, MAX_TOTAL_EDITS } from './schemas.js';

/** The only tree the agent may patch: package source (tests live in src/ here). */
const ALLOW = /^packages\/[^/]+\/src\/.+$/;

interface DenyRule {
  readonly pattern: RegExp;
  readonly reason: string;
}

const DENY: readonly DenyRule[] = [
  { pattern: /^\.github\//, reason: 'workflow and CI policy files' },
  { pattern: /(^|\/)package\.json$/, reason: 'package manifests' },
  { pattern: /(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/, reason: 'lockfiles' },
  { pattern: /^pnpm-workspace\.yaml$/, reason: 'workspace definition' },
  { pattern: /(^|\/)tsconfig[^/]*\.json$/, reason: 'TypeScript configs' },
  { pattern: /(^|\/)\.env/i, reason: 'environment files' },
  { pattern: /(?:eslint\.config\.|\.prettierrc|\.editorconfig|biome\.json|oxlint)/, reason: 'lint/format configs' },
  { pattern: /(^|\/)(?:AGENTS|GEMINI|CLAUDE)\.md$/i, reason: 'host instruction files' },
];

export interface PathVerdict {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function pathVerdict(path: string): PathVerdict {
  for (const rule of DENY) {
    if (rule.pattern.test(path)) {
      return { allowed: false, reason: `denied: ${rule.reason}` };
    }
  }
  if (!ALLOW.test(path)) {
    return { allowed: false, reason: 'outside packages/<pkg>/src/**' };
  }
  return { allowed: true };
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
