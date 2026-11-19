/**
 * model-router — project profile (`.ai/project.yml`) reading + defaults.
 *
 * Self-contained on purpose: plugins must not import across mod directories,
 * so this module vendors the same minimal YAML-subset reader that the other
 * mods vendor. Subset (anything else is a parse error → caller falls back to
 * the documented defaults — the router then stays fully pass-through):
 *   - nested maps with strict 2-space indentation steps
 *   - "- item" string sequences (indented one step under their key)
 *   - plain and quoted scalars ("..." with \" \\ escapes, '...' with '' escape)
 *   - full-line and trailing comments (#)
 *   - blank lines
 *   - NO tabs, NO flow maps/sequences, NO anchors, NO multi-document input
 *   - unknown keys are ignored (mods tolerate future schema evolution)
 */

import type { AgentRule, Effort, RouterConfig } from './classify.ts';

export type YamlValue = string | string[] | { [key: string]: YamlValue };

export function defaultRouterConfig(): RouterConfig {
  return { enabled: false, agents: {} };
}

/** The router activates only when explicitly enabled or when any agent mapping exists. */
export function routerActive(cfg: RouterConfig): boolean {
  return cfg.enabled || Object.keys(cfg.agents).length > 0;
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

function asBool(v: YamlValue | undefined, where: string): boolean {
  if (v === 'true' || v === 'yes') return true;
  if (v === 'false' || v === 'no' || v === '') return false;
  throw new Error(where + ': must be true or false');
}

function asEffort(v: YamlValue | undefined, where: string): Effort {
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  throw new Error(where + ': must be low, medium or high');
}

/**
 * Parse `.ai/project.yml` text into a RouterConfig. Throws on parse doubt or
 * invalid known values — the hook catches and uses `defaultRouterConfig()`
 * (router off, fully pass-through). Unknown keys are ignored.
 */
export function parseRouterProfile(text: string): RouterConfig {
  const doc = parseYaml(text);
  const cfg = defaultRouterConfig();
  const router = asMap(opt(doc, 'router'), 'router');
  if (router === null) return cfg;

  const enabled = opt(router, 'enabled');
  if (enabled !== undefined) cfg.enabled = asBool(enabled, 'router.enabled');

  const main = asMap(opt(router, 'main'), 'router.main');
  if (main !== null) {
    const model = opt(main, 'model');
    if (model === undefined || model === '') {
      // `main:` present but no usable model — nothing to pin
    } else {
      if (typeof model !== 'string') {
        throw new Error('router.main.model: expected a model id string');
      }
      if (model !== 'inherit') cfg.main = { model };
    }
  }

  const agents = asMap(opt(router, 'agents'), 'router.agents');
  if (agents !== null) {
    for (const name of Object.keys(agents)) {
      const where = 'router.agents.' + name;
      const entry = asMap(agents[name], where);
      if (entry === null) {
        throw new Error(where + ': expected a map of model/effort');
      }
      const route: AgentRule = {};
      const model = opt(entry, 'model');
      if (model !== undefined) {
        if (typeof model !== 'string') throw new Error(where + '.model: expected a string');
        if (model !== '') route.model = model; // "inherit" kept as-is
      }
      const effort = opt(entry, 'effort');
      if (effort !== undefined) route.effort = asEffort(effort, where + '.effort');
      if (route.model !== undefined || route.effort !== undefined) {
        cfg.agents[name] = route;
      }
    }
  }

  return cfg;
}
