/**
 * sdlc-guard — project profile (`.ai/project.yml`) reading + fail-safe defaults.
 *
 * Self-contained on purpose: plugins must not import across mod directories,
 * so this module vendors the same minimal YAML-subset reader that the other
 * mods vendor. Subset (anything else is a parse error → caller falls back to
 * the documented defaults — deny-class policy must fail CLOSED):
 *   - nested maps with strict 2-space indentation steps
 *   - "- item" string sequences (indented one step under their key)
 *   - plain and quoted scalars ("..." with \" \\ escapes, '...' with '' escape)
 *   - full-line and trailing comments (#)
 *   - blank lines
 *   - NO tabs, NO flow maps/sequences, NO anchors, NO multi-document input
 *   - unknown keys are ignored (mods must tolerate future schema evolution;
 *     the CLI is the strict validator, mods are the tolerant reader)
 */

export type YamlValue = string | string[] | { [key: string]: YamlValue };

export interface ApprovalsConfig {
  migrations: 'required' | 'not-required';
  deployment: 'required' | 'not-required';
}

export interface GuardConfig {
  approvals: ApprovalsConfig;
  /**
   * Effective protected-path globs:
   * (guard.protectedPaths ?? defaults) ∪ policies.protectedPaths ∪ ['.git/**'].
   * `.git/**` internals can never be unprotected; everything else layers.
   */
  protectedPaths: string[];
}

export const DEFAULT_PROTECTED_PATHS: readonly string[] = [
  '.github/workflows/**',
  '.git/**',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
];

export function defaultGuardConfig(): GuardConfig {
  return {
    approvals: { migrations: 'required', deployment: 'required' },
    protectedPaths: DEFAULT_PROTECTED_PATHS.slice(),
  };
}

// ---------------------------------------------------------------------------
// YAML subset parser (vendored — keep in sync with the other mods' copies)
// ---------------------------------------------------------------------------

interface ContentLine {
  indent: number;
  text: string;
  lineNo: number;
}

function stripComment(rawLine: string, lineNo: number): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < rawLine.length; i++) {
    const ch = rawLine[i];
    if (quote !== null) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '#') {
      const prev = out.length > 0 ? out[out.length - 1] : '';
      if (prev === '' || prev === ' ' || prev === '\t') break; // comment starts
    }
    out += ch;
  }
  if (quote !== null) {
    throw new Error('line ' + lineNo + ': unterminated quoted scalar');
  }
  return out;
}

function analyzeLine(rawLine: string, lineNo: number): ContentLine | null {
  if (rawLine.trim() === '') return null; // blank line
  const noComment = stripComment(rawLine, lineNo).trimEnd();
  if (noComment.trim() === '') return null; // comment-only line
  if (noComment.indexOf('\t') >= 0) {
    throw new Error('line ' + lineNo + ': tabs are not allowed (use 2-space indentation)');
  }
  const indentMatch = /^ */.exec(noComment);
  const indent = indentMatch !== null ? indentMatch[0].length : 0;
  if (indent % 2 !== 0) {
    throw new Error('line ' + lineNo + ': indentation must be 2-space steps');
  }
  return { indent, text: noComment.trim(), lineNo };
}

const KEY_RE = /^(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*:(.*)$/;

function parseScalar(s: string, lineNo: number): string {
  if (s === '') return '';
  if (s.startsWith('{') || s.startsWith('[')) {
    throw new Error('line ' + lineNo + ': flow collections ({...} / [...]) are not supported, use block style');
  }
  if (s.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) {
      throw new Error('line ' + lineNo + ': unterminated double-quoted scalar');
    }
    const inner = s.slice(1, -1);
    if (/\\[^"\\]/.test(inner)) {
      throw new Error('line ' + lineNo + ': only \\" and \\\\ escapes are supported');
    }
    return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (s.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(s)) {
      throw new Error('line ' + lineNo + ': unterminated single-quoted scalar');
    }
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.includes('"') || s.includes("'")) {
    throw new Error('line ' + lineNo + ': quotes must wrap the whole scalar');
  }
  return s;
}

function parseNode(
  lines: ContentLine[],
  startIdx: number,
  depth: number,
): { value: YamlValue; next: number } {
  const first = lines[startIdx];
  if (first.indent !== depth * 2) {
    throw new Error('line ' + first.lineNo + ': expected indentation of ' + depth * 2 + ' spaces');
  }

  // Sequence node: "- item" lines all at this depth.
  if (first.text === '-' || first.text.startsWith('- ')) {
    const items: string[] = [];
    let i = startIdx;
    while (i < lines.length) {
      const ln = lines[i];
      if (ln.indent !== depth * 2) break;
      if (!(ln.text === '-' || ln.text.startsWith('- '))) break;
      items.push(parseScalar(ln.text === '-' ? '' : ln.text.slice(2).trim(), ln.lineNo));
      i++;
    }
    return { value: items, next: i };
  }

  // Map node: "key: value" / "key:" + nested block, all at this depth.
  const map: { [key: string]: YamlValue } = {};
  let i = startIdx;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.indent < depth * 2) break; // dedent: hand control back to the parent
    if (ln.indent > depth * 2) {
      throw new Error('line ' + ln.lineNo + ': unexpected indentation');
    }
    if (ln.text === '-' || ln.text.startsWith('- ')) {
      throw new Error('line ' + ln.lineNo + ': sequence items must be indented under their key');
    }
    const m = KEY_RE.exec(ln.text);
    if (m === null) {
      throw new Error('line ' + ln.lineNo + ': expected "key: value"');
    }
    const key = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] as string;
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      throw new Error('line ' + ln.lineNo + ': duplicate key "' + key + '"');
    }
    const rest = (m[4] ?? '').trim();
    if (rest === '') {
      const child = i + 1 < lines.length && lines[i + 1].indent > depth * 2 ? lines[i + 1] : null;
      if (child !== null) {
        if (child.indent !== (depth + 1) * 2) {
          throw new Error(
            'line ' + child.lineNo + ': child blocks must be exactly one 2-space step deeper',
          );
        }
        const parsed = parseNode(lines, i + 1, depth + 1);
        map[key] = parsed.value;
        i = parsed.next;
      } else {
        map[key] = '';
        i++;
      }
    } else {
      map[key] = parseScalar(rest, ln.lineNo);
      i++;
    }
  }
  return { value: map, next: i };
}

/** Parse the supported YAML subset. Throws on ANY doubt — callers fall back to defaults. */
export function parseYaml(source: string): { [key: string]: YamlValue } {
  const rawLines = source.split(/\r?\n/);
  const lines: ContentLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cl = analyzeLine(rawLines[i], i + 1);
    if (cl !== null) lines.push(cl);
  }
  if (lines.length === 0) return {};
  const parsed = parseNode(lines, 0, 0);
  if (parsed.next !== lines.length) {
    throw new Error('line ' + lines[parsed.next].lineNo + ': unexpected trailing content');
  }
  if (typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    throw new Error('top-level value must be a map');
  }
  return parsed.value;
}

// ---------------------------------------------------------------------------
// Profile mapping
// ---------------------------------------------------------------------------

function opt(map: { [key: string]: YamlValue }, key: string): YamlValue | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function asMap(v: YamlValue | undefined, where: string): { [key: string]: YamlValue } | null {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(where + ': expected a nested map');
  }
  return v;
}

function asStringArray(v: YamlValue | undefined, where: string): string[] {
  if (v === undefined || !Array.isArray(v)) {
    throw new Error(where + ': expected a "- item" sequence');
  }
  const items: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') {
      throw new Error(where + ': sequence items must be plain strings');
    }
    items.push(item);
  }
  return items;
}

function asApproval(
  v: YamlValue | undefined,
  where: string,
  fallback: 'required' | 'not-required',
): 'required' | 'not-required' {
  if (v === undefined || v === '') return fallback;
  if (v !== 'required' && v !== 'not-required') {
    throw new Error(where + ': must be "required" or "not-required"');
  }
  return v;
}

function unionPaths(a: string[], b: string[]): string[] {
  const out = a.slice();
  for (const p of b) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * Parse `.ai/project.yml` text into a GuardConfig. Throws on parse doubt or
 * invalid known values — the hook catches and uses `defaultGuardConfig()`.
 * Unknown keys are ignored.
 *
 * Path layering (deny-class, fail closed):
 *   effective = (guard.protectedPaths ?? DEFAULTS) ∪ policies.protectedPaths ∪ ['.git/**']
 * An explicit guard.protectedPaths replaces the defaults for that key, but
 * `.git/**` internals are ALWAYS protected, and policies.protectedPaths always
 * add on top.
 */
export function parseGuardProfile(text: string): GuardConfig {
  const doc = parseYaml(text);
  const cfg = defaultGuardConfig();

  let policyPaths: string[] | null = null;
  const policies = asMap(opt(doc, 'policies'), 'policies');
  if (policies !== null) {
    const approvals = asMap(opt(policies, 'approvals'), 'policies.approvals');
    if (approvals !== null) {
      cfg.approvals.migrations = asApproval(
        opt(approvals, 'migrations'),
        'policies.approvals.migrations',
        cfg.approvals.migrations,
      );
      cfg.approvals.deployment = asApproval(
        opt(approvals, 'deployment'),
        'policies.approvals.deployment',
        cfg.approvals.deployment,
      );
      const forcePush = opt(approvals, 'forcePush');
      if (forcePush !== undefined && forcePush !== '' && forcePush !== 'prohibited') {
        // Fail closed: force push can only ever be "prohibited" in this schema.
        throw new Error('policies.approvals.forcePush: only "prohibited" is allowed');
      }
    }
    const pp = opt(policies, 'protectedPaths');
    if (pp !== undefined) {
      policyPaths = asStringArray(pp, 'policies.protectedPaths');
    }
  }

  let guardPaths: string[] | null = null;
  const guard = asMap(opt(doc, 'guard'), 'guard');
  if (guard !== null) {
    const gp = opt(guard, 'protectedPaths');
    if (gp !== undefined) {
      guardPaths = asStringArray(gp, 'guard.protectedPaths');
    }
  }

  let paths = guardPaths !== null ? guardPaths : DEFAULT_PROTECTED_PATHS.slice();
  if (policyPaths !== null) paths = unionPaths(paths, policyPaths);
  paths = unionPaths(paths, ['.git/**']); // .git internals are always protected
  cfg.protectedPaths = paths;

  return cfg;
}
