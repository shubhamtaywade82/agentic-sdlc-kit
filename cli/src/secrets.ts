/**
 * Canonical secret-detection patterns shared with the runtime guard mod.
 * The regexes below are the single source of truth — keep them byte-identical
 * when porting to other kit components.
 *
 * Previews NEVER contain the full secret: first 8 characters + "…".
 */

export interface SecretPattern {
  id: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { id: "aws-access-key-id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private-key-block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/ },
  { id: "gitlab-token", regex: /\bglpat-[0-9A-Za-z_-]{20,}\b/ },
  { id: "slack-token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: "stripe-key", regex: /\b(sk|pk)_(live|test)_[0-9A-Za-z]{24,}\b/ },
  { id: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "openai-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  {
    id: "generic-assignment",
    regex: /\b(password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token)\b['"]?\s*[:=]\s*['"][^'"\s]{16,}['"]/i,
  },
];

const PLACEHOLDER_WORDS = ["changeme", "example", "placeholder", "dummy", "redacted"] as const;

/**
 * Placeholder heuristics: values that look like templates or documented
 * examples are not findings.
 */
export function isPlaceholder(value: string): boolean {
  const v = value.toLowerCase();
  if (/\$\{[^}]*\}/.test(v)) return true;
  if (/\{\{[^}]*\}\}/.test(v)) return true;
  if (/<[^>]*>/.test(v)) return true;
  if (/x{5,}/.test(v)) return true;
  for (const w of PLACEHOLDER_WORDS) {
    if (v.includes(w)) return true;
  }
  if (v.startsWith("your")) return true;
  return false;
}

export interface SecretFinding {
  patternId: string;
  /** the exact matched text — used for allowlist suppression, never printed */
  matchedText: string;
  /** first 8 characters of the match + "…" */
  preview: string;
  /** 1-based line number (filled by the caller) */
  line: number;
}

/** Extract the quoted value from a generic-assignment match. */
function extractQuotedValue(match: string): string | null {
  const m = /['"]([^'"\s]+)['"]\s*$/.exec(match);
  return m !== null ? m[1] : null;
}

/** Scan one line of text; returns findings for that line (line passed through). */
export function scanLine(text: string, line: number): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const p of SECRET_PATTERNS) {
    const re = new RegExp(p.regex.source, p.regex.flags.includes("g") ? p.regex.flags : p.regex.flags + "g");
    let m = re.exec(text);
    while (m !== null) {
      const matched = m[0];
      if (matched.length === 0) {
        re.lastIndex++;
        m = re.exec(text);
        continue;
      }
      if (p.id === "openai-key") {
        // stripe keys have their own pattern; never double-report them
        if (matched.startsWith("sk_live_") || matched.startsWith("sk_test_")) {
          m = re.exec(text);
          continue;
        }
      }
      if (p.id === "generic-assignment") {
        const value = extractQuotedValue(matched);
        if (value !== null && isPlaceholder(value)) {
          m = re.exec(text);
          continue;
        }
      } else if (isPlaceholder(matched)) {
        m = re.exec(text);
        continue;
      }
      findings.push({
        patternId: p.id,
        matchedText: matched,
        preview: matched.slice(0, 8) + "…",
        line,
      });
      m = re.exec(text);
    }
  }
  return findings;
}

/** Scan a whole file's content (already decoded as UTF-8 text). */
export function scanContent(content: string): Array<SecretFinding & { line: number }> {
  const findings: Array<SecretFinding & { line: number }> = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const f of scanLine(lines[i], i + 1)) {
      findings.push(f);
    }
  }
  return findings;
}
