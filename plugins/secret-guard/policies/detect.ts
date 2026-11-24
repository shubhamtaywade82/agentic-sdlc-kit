// plugins/secret-guard/policies/detect.ts
//
// VENDORED, self-contained secret detection for the secret-guard plugin
// (detector + scanner + redactor, from the kit's core/contracts M11
// surface). A Claude Code hooks module may only import its own files by
// relative path (plus 'claude-code'), so the plugin cannot reach into
// @agentic-sdlc-kit/core — the logic is duplicated here deliberately and
// must stay behaviorally compatible with the kit packages.
//
// Differences from the core packages, on purpose:
//   - The input-size bound counts UTF-16 code units (text.length), not
//     bytes: the plugin's module graph stays free of Node-specific globals
//     so it loads everywhere the host does.
//   - The rule set is inlined (no zod schema): the plugin ships a fixed,
//     versioned baseline.
//
// INVARIANT (M11): a finding does not prove redaction — the redactor
// verifies the value is gone from the output before setting `redacted`.
// A scanner failure MUST surface as `failed`, never as `clean`.

export type SecretKind =
  | 'aws-access-key'
  | 'aws-secret-key'
  | 'github-token'
  | 'gitlab-token'
  | 'google-api-key'
  | 'stripe-key'
  | 'slack-token'
  | 'private-key-pem'
  | 'generic-api-key'
  | 'openai-key'
  | 'anthropic-key'
  | 'jwt-token'
  | 'dhan-credential'
  | 'db-url-credentials'
  | 'password-assignment'
  | 'unknown';

export type SecretSource =
  | 'file-read'
  | 'file-write'
  | 'tool-output'
  | 'git-staged'
  | 'git-commit'
  | 'git-push'
  | 'mcp-response';

export interface DetectionRule {
  id: string;
  kind: SecretKind;
  pattern: string;
  severity: 'high' | 'critical' | 'medium';
  enabled: boolean;
}

// Vendored from @agentic-sdlc-kit/contracts (detection-rule.ts); keep in sync.
/** ECMAScript has no (?i) flag: build case-insensitive classes explicitly. */
const ci = (word: string): string =>
  [...word].map((c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).join('');

const PLACEHOLDER_WORDS = ['your', 'xxx', 'example', 'changeme', 'placeholder', 'replace', 'none', 'null', 'todo'];

/**
 * DhanHQ credentials, matched by NAME because no official token format is
 * pinned here.
 *  - NAMED: DHAN_ACCESS_TOKEN / DHAN_API_SECRET / DHAN_PIN / DHAN_TOTP_SECRET
 *    assigned a literal of 6+ chars; placeholders are skipped.
 *  - GENERIC: any other variable named dhan...token/secret/key assigned a 20+
 *    char value that contains a digit (so `self.config.dhan_access_token`
 *    does not match) and is not a placeholder.
 */
// The redactor's own output must never re-match as a credential (idempotence).
const PLACEHOLDER = `(?!(?:${PLACEHOLDER_WORDS.map(ci).join('|')}|\\[REDACTED))`;

const DHAN_NAMED_PATTERN =
  `${ci('dhan')}[_-]?(?:${ci('access')}[_-]?${ci('token')}|${ci('api')}[_-]?${ci('secret')}|${ci('pin')}|${ci('totp')}[_-]?${ci('secret')})` +
  `["']?\\s*[:=]\\s*["']?(?![$<{])${PLACEHOLDER}([^\\s"']{6,})`;

const DHAN_GENERIC_PATTERN =
  `${ci('dhan')}[A-Za-z0-9_-]{0,30}?(?:${ci('token')}|${ci('secret')}|${ci('key')})["']?\\s*[:=]\\s*["']?` +
  `${PLACEHOLDER}(?=[A-Za-z0-9_.+/=-]*[0-9])([A-Za-z0-9_.+/=-]{20,})`;

/** Bearer credential: header.payload.signature, base64url '{"' prefixes. */
const JWT_PATTERN = 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}';

/**
 * Built-in detection rules (the kit's M11 baseline set). ECMAScript regex
 * sources; applied with the global flag. A rule with a capture group
 * matches the captured group as the secret value.
 */
export const BUILTIN_DETECTION_RULES: ReadonlyArray<DetectionRule> = [
  {
    id: 'aws-access-key',
    kind: 'aws-access-key',
    pattern: 'AKIA[0-9A-Z]{16}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'aws-secret-key',
    kind: 'aws-secret-key',
    // 40-char base64-ish string after an assignment with an aws_secret hint.
    pattern:
      '(?:aws_secret|secretAccessKey|secret_access_key)["\']?\\s*[:=]\\s*["\']?([A-Za-z0-9/+]{40})',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'github-token',
    kind: 'github-token',
    pattern: 'gh[pousr]_[A-Za-z0-9]{36,}',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'gitlab-token',
    kind: 'gitlab-token',
    pattern: 'glpat-[A-Za-z0-9_-]{20}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'google-api-key',
    kind: 'google-api-key',
    pattern: 'AIza[0-9A-Za-z_-]{35}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'stripe-key',
    kind: 'stripe-key',
    pattern: 'sk_(?:live|test)_[0-9a-zA-Z]{24,}',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'slack-token',
    kind: 'slack-token',
    pattern: 'xox[baprs]-[0-9A-Za-z-]{10,}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'private-key-pem',
    kind: 'private-key-pem',
    pattern: '-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'anthropic-key',
    kind: 'anthropic-key',
    pattern: '(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{32,}',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'openai-key',
    kind: 'openai-key',
    // Covers sk-..., sk-proj-..., sk-svcacct-..., sk-admin-...; the lookahead
    // keeps Anthropic keys (sk-ant-) out of this rule. The digit lookahead
    // rejects English identifiers such as sk-learning-about-sorting.
    pattern: '(?<![A-Za-z0-9])sk-(?!ant-)(?:proj-|svcacct-|admin-)?(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'jwt-token',
    kind: 'jwt-token',
    // DhanHQ access tokens are JWTs; any header.payload.signature triple
    // starting with the base64url '{"' prefix is a bearer credential.
    pattern: JWT_PATTERN,
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'dhan-credential',
    kind: 'dhan-credential',
    pattern: DHAN_NAMED_PATTERN,
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'db-url-credentials',
    kind: 'db-url-credentials',
    // scheme://user:PASSWORD@host — the captured group is the password. A
    // placeholder such as ${DB_PASSWORD} or <password> is not a secret.
    pattern: '[a-zA-Z][a-zA-Z0-9+.-]*://[^\\s:/@\'"]+:(?![$<{])([^\\s@\'"/]{4,})@[^\\s\'"]+',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'password-assignment',
    kind: 'password-assignment',
    // Case-insensitive by explicit classes (no (?i) in ECMAScript). Medium
    // severity: a quoted literal of 8+ chars assigned to a password name.
    pattern:
      '(?:[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Pp][Aa][Ss][Ss][Ww][Dd]|[Pp][Ww][Dd])\\s*[:=]\\s*["\']([^"\'\\s$<{]{8,})["\']',
    severity: 'medium',
    enabled: true,
  },
  {
    id: 'generic-api-key',
    kind: 'generic-api-key',
    // Heuristic: api key / auth token / secret (case-insensitive via
    // explicit classes — ECMAScript regex has no (?i) flag) assigned to a
    // 32+ char quoted value. Low confidence by design.
    pattern:
      '(?:[Aa][Pp][Ii][_\\-]?[Kk][Ee][Yy]|[Aa][Uu][Tt][Hh][_\\-]?[Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt])\\s*[:=]\\s*["\']([A-Za-z0-9_+/=-]{32,})["\']',
    severity: 'medium',
    enabled: true,
  },
  {
    id: 'dhan-credential-generic',
    kind: 'dhan-credential',
    pattern: DHAN_GENERIC_PATTERN,
    severity: 'critical',
    enabled: true,
  },
];

export interface SecretFinding {
  id: string;
  kind: SecretKind;
  location: {
    filePath?: string;
    line?: number;
    column?: number;
    offset: number;
    length: number;
    source: SecretSource;
  };
  severity: 'high' | 'critical' | 'medium';
  /** First characters + length — NEVER the full secret value. */
  redactedPreview: string;
  redacted: boolean;
}

export type ScannerOutcome =
  | 'clean'
  | 'findings'
  | 'failed'
  | 'skipped-too-large'
  | 'skipped-ignored';

export interface ScannerResult {
  outcome: ScannerOutcome;
  /** Present only when outcome === 'findings'. */
  findings: Array<{ id: string; kind: string; redactedPreview: string }>;
  /** Present only when outcome === 'failed'. NEVER includes the input. */
  error?: { code: string; message: string };
  /** Code units scanned (or skipped). */
  charsProcessed: number;
  durationMs: number;
}

export interface RedactionPolicy {
  schemaVersion: 1;
  placeholderFormat: string;
  redactPartial: boolean;
  redactRepeated: boolean;
  maxInputChars: number;
  ignorePaths: string[];
}

export const DEFAULT_REDACTION_POLICY: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED:<kind>:<id>]',
  redactPartial: true,
  redactRepeated: true,
  maxInputChars: 1_000_000,
  ignorePaths: [],
};

/**
 * What the redactor can honestly claim about its output:
 *  - verified-clean: scanned, nothing found.
 *  - redacted:       scanned, every found value verified gone.
 *  - not-scanned:    NOT scanned (e.g. over the size limit). Never "clean".
 *  - failed:         scanned, but redaction could not be verified complete.
 */
export type RedactionStatus = 'verified-clean' | 'redacted' | 'not-scanned' | 'failed';

export interface RedactionResult {
  redactedText: string;
  findings: SecretFinding[];
  status: RedactionStatus;
  // True only after the redactor VERIFIED every value is gone (and scanned).
  fullyRedacted: boolean;
}

/** Stands in for text that was not scanned: the raw text must never pass through. */
export function withheldMarker(length: number, limit: number): string {
  return `[WITHHELD: ${length} chars exceed the secret-scan limit of ${limit}; output was not scanned]`;
}

function redactedPreview(value: string): string {
  if (value.length < 12) {
    return `[REDACTED:${value.length}]`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

interface CompiledRule {
  rule: DetectionRule;
  pattern: RegExp;
}

const COMPILED_BUILTINS: ReadonlyArray<CompiledRule> = BUILTIN_DETECTION_RULES.filter(
  (r) => r.enabled,
).map((rule) => ({ rule, pattern: new RegExp(rule.pattern, 'g') }));

/**
 * Detect secrets in text. Returns findings with redacted previews; never
 * the full secret value.
 */
export function detectSecrets(
  text: string,
  source: SecretSource,
  filePath?: string,
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { rule, pattern } of COMPILED_BUILTINS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      // A rule with a capture group matches the group; else the whole match.
      const value = m[1] ?? m[0];
      if (!value) continue;
      const offset = m.index + m[0].indexOf(value);
      const upTo = text.slice(0, offset);
      const lines = upTo.split('\n');
      const line = lines.length;
      const column = (lines[lines.length - 1]?.length ?? 0) + 1;
      findings.push({
        id: `F-${findings.length + 1}`,
        kind: rule.kind,
        location: {
          ...(filePath !== undefined ? { filePath } : {}),
          line,
          column,
          offset,
          length: value.length,
          source,
        },
        severity: rule.severity,
        redactedPreview: redactedPreview(value),
        redacted: false,
      });
      // Avoid an infinite loop on zero-length matches.
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return findings;
}

/**
 * Scan text under a policy. One of five outcomes — a failure or skip is
 * NEVER reported as clean.
 */
export function scanText(
  text: string,
  policy: RedactionPolicy,
  source: SecretSource,
  filePath?: string,
): ScannerResult {
  const start = Date.now();
  const chars = text.length;
  if (chars > policy.maxInputChars) {
    return {
      outcome: 'skipped-too-large',
      findings: [],
      charsProcessed: chars,
      durationMs: Date.now() - start,
    };
  }
  if (filePath !== undefined && policy.ignorePaths.includes(filePath)) {
    return {
      outcome: 'skipped-ignored',
      findings: [],
      charsProcessed: chars,
      durationMs: Date.now() - start,
    };
  }
  try {
    const findings = detectSecrets(text, source, filePath);
    return {
      outcome: findings.length === 0 ? 'clean' : 'findings',
      findings: findings.map((f) => ({ id: f.id, kind: f.kind, redactedPreview: f.redactedPreview })),
      charsProcessed: chars,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      outcome: 'failed',
      findings: [],
      error: { code: 'SCANNER_ERROR', message: e instanceof Error ? e.message : String(e) },
      charsProcessed: chars,
      durationMs: Date.now() - start,
    };
  }
}

function formatPlaceholder(policy: RedactionPolicy, f: SecretFinding): string {
  return policy.placeholderFormat
    .replace('<kind>', f.kind)
    .replace('<id>', f.id)
    .replace('<len>', String(f.location.length));
}

/**
 * Replace every detected secret value with a placeholder, then VERIFY the
 * redaction: a finding's `redacted` flag is set only after its value is
 * confirmed gone from the output.
 */
interface Span {
  start: number;
  end: number;
  finding: SecretFinding;
}

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Findings can overlap or share a range (a name-anchored rule and a
 * token-shape rule both match one value). Each region must be replaced
 * exactly once: replacing twice uses stale offsets and destroys the text
 * next to the secret. Overlaps merge into one span labelled by the most
 * severe finding.
 */
function mergeSpans(findings: ReadonlyArray<SecretFinding>): Span[] {
  const spans: Span[] = findings
    .map((f) => ({
      start: f.location.offset,
      end: f.location.offset + f.location.length,
      finding: f,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      if ((SEVERITY_RANK[s.finding.severity] ?? 0) > (SEVERITY_RANK[last.finding.severity] ?? 0)) {
        last.finding = s.finding;
      }
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

export function redactSecrets(
  text: string,
  policy: RedactionPolicy,
  source: SecretSource,
  filePath?: string,
): RedactionResult {
  if (text.length > policy.maxInputChars) {
    // Unscanned is not clean: withhold the text rather than pass it through.
    return {
      redactedText: withheldMarker(text.length, policy.maxInputChars),
      findings: [],
      status: 'not-scanned',
      fullyRedacted: false,
    };
  }
  const findings = detectSecrets(text, source, filePath);
  if (findings.length === 0) {
    return { redactedText: text, findings: [], status: 'verified-clean', fullyRedacted: true };
  }
  let redactedText = text;
  const updatedFindings: SecretFinding[] = [];
  // Replace from the end so earlier offsets stay valid.
  for (const sp of mergeSpans(findings).reverse()) {
    redactedText =
      redactedText.slice(0, sp.start) + formatPlaceholder(policy, sp.finding) + redactedText.slice(sp.end);
  }
  // Verify: re-run the detector on the redacted output and check each
  // original value is really gone.
  const recheck = detectSecrets(redactedText, source, filePath);
  for (const f of findings) {
    const originalValue = text.slice(f.location.offset, f.location.offset + f.location.length);
    const stillAppears = redactedText.includes(originalValue);
    updatedFindings.push({ ...f, redacted: !stillAppears });
  }
  const fullyRedacted = updatedFindings.every((f) => f.redacted) && recheck.length === 0;
  return {
    redactedText,
    findings: updatedFindings,
    status: fullyRedacted ? 'redacted' : 'failed',
    fullyRedacted,
  };
}
