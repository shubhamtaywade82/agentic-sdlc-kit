/**
 * sdlc-guard — protected-path policy for file edits (pure policy, no $ usage).
 *
 * Denies Write/Edit/NotebookEdit into protected path globs. The matcher is a
 * small, dependency-free glob engine supporting `**` (any number of path
 * segments), `*` (within one segment) and exact segments.
 *
 * Matching semantics (chosen protective on purpose — this is a deny-class
 * policy that must fail closed):
 *   - a pattern matches if it matches the full path OR any suffix of the path
 *     aligned to segment boundaries, so `.env` matches `config/.env` and
 *     `*.pem` matches `certs/server.pem` no matter how deep;
 *   - absolute paths are matched by their tail segments, so a session-cwd
 *     absolute path like /home/x/proj/.github/workflows/ci.yml is still caught.
 *
 * `.ai/manifest` and `.ai/project.yml` are deliberately NOT protected — users
 * and kit workflows edit them by design. Only the configured globs (plus the
 * always-on defaults, which include `.git/**`) are protected.
 */

export interface FilePolicyConfig {
  protectedPaths: string[];
}

export interface PathVerdict {
  action: 'allow' | 'deny';
  rule: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Glob matcher
// ---------------------------------------------------------------------------

function splitPathSegments(p: string): string[] {
  let s = p.replace(/\/{2,}/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/\/+$/, '');
  if (s === '/') return [];
  if (s === '') return [];
  return s.split('/');
}

const segRegexCache = new Map<string, RegExp>();

function segmentMatcher(seg: string): RegExp {
  const cached = segRegexCache.get(seg);
  if (cached !== undefined) return cached;
  const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*');
  const re = new RegExp('^' + escaped + '$');
  segRegexCache.set(seg, re);
  return re;
}

function matchSegments(globSegs: string[], pathSegs: string[]): boolean {
  if (globSegs.length === 0) return pathSegs.length === 0;
  if (globSegs[0] === '**') {
    // `**` matches zero or more path segments.
    for (let skip = 0; skip <= pathSegs.length; skip++) {
      if (matchSegments(globSegs.slice(1), pathSegs.slice(skip))) return true;
    }
    return false;
  }
  if (pathSegs.length === 0) return false;
  if (!segmentMatcher(globSegs[0]).test(pathSegs[0])) return false;
  return matchSegments(globSegs.slice(1), pathSegs.slice(1));
}

/** True if `glob` matches `path` (full path or any segment-aligned suffix). */
export function globMatch(glob: string, path: string): boolean {
  const g = splitPathSegments(glob);
  const p = splitPathSegments(path);
  if (g.length === 0) return false; // an empty pattern protects nothing
  for (let start = 0; start < p.length; start++) {
    if (matchSegments(g, p.slice(start))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Path assessment
// ---------------------------------------------------------------------------

export function assessPath(path: string, cfg: FilePolicyConfig): PathVerdict {
  const p = path.trim();
  if (p === '') {
    return { action: 'allow', rule: 'empty-path', reason: '' };
  }
  for (const glob of cfg.protectedPaths) {
    if (globMatch(glob, p)) {
      return {
        action: 'deny',
        rule: 'protected-path:' + glob,
        reason:
          '"' + p + '" matches the protected path pattern "' + glob + '" and is governed by ' +
          'sdlc-guard (see guard.protectedPaths in .ai/project.yml). ' +
          'If this change is intentional, ask the user to make it manually or to adjust the pattern.',
      };
    }
  }
  return { action: 'allow', rule: 'default', reason: '' };
}
