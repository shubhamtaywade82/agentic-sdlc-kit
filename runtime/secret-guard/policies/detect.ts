/**
 * secret-guard — secret detection patterns (pure policy, no $ usage).
 *
 * CANONICAL pattern list — shared spec with the kit CLI. Keep the ids and
 * regexes in sync with the CLI implementation; tests in runtime-tests cover
 * every pattern with real-shaped samples.
 *
 * Findings never include the full secret: `preview` is the first 6 characters
 * of the match plus an ellipsis ('...'), which is enough to locate the line
 * without echoing the credential into the transcript.
 */

export interface Finding {
  patternId: string;
  /** 1-based line number. */
  line: number;
  /** First 6 chars of the match + '...' — NEVER the full secret. */
  preview: string;
}

interface PatternDef {
  id: string;
  re: RegExp;
}

export const PATTERNS: readonly PatternDef[] = [
  { id: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'gitlab-token', re: /\bglpat-[0-9A-Za-z_-]{20,}\b/g },
  { id: 'slack-token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { id: 'stripe-key', re: /\b(sk|pk)_(live|test)_[0-9A-Za-z]{24,}\b/g },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  {
    id: 'generic-assignment',
    re: /\b(password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token)\b['"]?\s*[:=]\s*['"][^'"\s]{16,}['"]/gi,
  },
];

/** Extracts the quoted value out of a generic-assignment match. */
const GENERIC_VALUE_RE = /[:=]\s*['"]([^'"\s]{16,})['"]/;

const PLACEHOLDER_MARKERS = [
  'changeme',
  'change-me',
  'example',
  'placeholder',
  'dummy',
  'xxxxx',
  'redacted',
  'your',
];

/**
 * True for obviously non-secret values: template interpolation (${...},
 * {{...}}), fully angle-wrapped placeholders (<...>), and values containing
 * common placeholder markers (case-insensitive).
 */
export function isPlaceholder(v: string): boolean {
  const s = v.trim();
  if (s === '') return true;
  if (/\$\{[^}]*\}/.test(s)) return true;
  if (/\{\{[^}]*\}\}/.test(s)) return true;
  if (/^<[^>]*>$/.test(s)) return true;
  const lower = s.toLowerCase();
  for (const marker of PLACEHOLDER_MARKERS) {
    if (lower.includes(marker)) return true;
  }
  return false;
}

function previewOf(matched: string): string {
  return matched.slice(0, 6) + '...';
}

/**
 * Scan text and return findings (patternId, 1-based line, truncated preview).
 * Placeholder VALUES in generic assignments are ignored so `.env.example`-style
 * files don't fire; strictly-shaped tokens (AKIA…, ghp_…, …) are always real
 * findings — this is a fail-closed detector.
 */
export function scanText(text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const p of PATTERNS) {
      for (const m of lines[i].matchAll(p.re)) {
        const matched = m[0];
        // openai-key: skip matches that start with sk_live_/sk_test_ (stripe).
        if (p.id === 'openai-key' && (matched.startsWith('sk_live_') || matched.startsWith('sk_test_'))) {
          continue;
        }
        if (p.id === 'generic-assignment') {
          const vm = GENERIC_VALUE_RE.exec(matched);
          if (vm === null) continue;
          if (isPlaceholder(vm[1])) continue;
        }
        findings.push({ patternId: p.id, line: i + 1, preview: previewOf(matched) });
      }
    }
  }
  return findings;
}

/**
 * Replace each detected secret with a patternId-tagged mask, e.g.
 * '[REDACTED:github-token]'. Placeholder values are left untouched.
 */
export function redact(text: string): string {
  let out = text;
  for (const p of PATTERNS) {
    out = out.replace(p.re, (matched) => {
      if (p.id === 'openai-key' && (matched.startsWith('sk_live_') || matched.startsWith('sk_test_'))) {
        return matched;
      }
      if (p.id === 'generic-assignment') {
        const vm = GENERIC_VALUE_RE.exec(matched);
        if (vm === null || isPlaceholder(vm[1])) return matched;
      }
      return '[REDACTED:' + p.id + ']';
    });
  }
  return out;
}

/**
 * Production-flavored .env files (.env.production, .env.live, .env.prod and
 * suffixed variants). Writing these is worth a confirmation question even
 * when the content is clean — they rarely belong in a repository.
 */
export function isProdEnvPath(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return /^\.env\.(production|live|prod)(\..+)?$/.test(base);
}
