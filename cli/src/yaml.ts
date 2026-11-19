/**
 * Minimal, deterministic YAML subset used by the kit (.ai/project.yml and
 * markdown frontmatter).
 *
 * Supported syntax (nothing else):
 *   - comments (`# ...`, quote-aware) and blank lines
 *   - one top-level map; nested maps via exactly 2-space indentation
 *   - plain, single-quoted and double-quoted string scalars
 *   - `- item` sequences whose items are strings
 *   - `true` / `false` parse as booleans, integers (`-?\d+`) as numbers
 *   - keys match [A-Za-z0-9_-]+
 *
 * Everything else (tabs, anchors/aliases, block scalars, flow style,
 * multi-document markers, tags, duplicate keys, bad indentation jumps) is
 * rejected with a precise line-numbered error.
 */

export type YamlScalar = string | number | boolean;
export interface YamlMap {
  [key: string]: YamlValue;
}
export type YamlValue = YamlScalar | YamlMap | YamlValue[];

export interface YamlError {
  line: number;
  code: string;
  message: string;
}

export class YamlParseError extends Error {
  readonly line: number;
  readonly code: string;

  constructor(err: YamlError) {
    super(`line ${err.line}: ${err.code}: ${err.message}`);
    this.name = "YamlParseError";
    this.line = err.line;
    this.code = err.code;
  }
}

const KEY_RE = /^([A-Za-z0-9_-]+):(?: (.*))?$/;
const SEQ_PREFIX = "- ";
const INT_RE = /^-?\d+$/;

interface SignifLine {
  /** 1-based line number in the source document */
  line: number;
  /** number of leading spaces */
  indent: number;
  /** content with comments stripped and surrounding blanks trimmed */
  text: string;
}

function fail(line: number, code: string, message: string): never {
  throw new YamlParseError({ line, code, message });
}

/** Strip a quote-aware trailing comment. Returns the raw line cut position. */
function stripComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
    } else if (inDouble) {
      if (ch === "\\") i++;
      else if (ch === '"') inDouble = false;
    } else if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (ch === "#" && (i === 0 || raw[i - 1] === " ")) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function toSignificantLines(text: string): SignifLine[] {
  const rawLines = text.split(/\r?\n/);
  const result: SignifLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (raw.includes("\t")) {
      fail(i + 1, "TAB_CHARACTER", "tab characters are not allowed in this YAML subset; use spaces");
    }
    const trimmedStart = raw.trimStart();
    if (trimmedStart === "") continue; // blank line
    if (trimmedStart.startsWith("#")) continue; // whole-line comment
    const marker = trimmedStart.trimEnd();
    if (marker === "---" || marker === "..." || marker.startsWith("--- ")) {
      fail(i + 1, "MULTI_DOCUMENT", "multi-document markers (---/...) are not supported; a single top-level map is expected");
    }
    if (trimmedStart.startsWith("%")) {
      fail(i + 1, "DIRECTIVE", "directives (starting with %) are not supported");
    }
    const cut = stripComment(raw).trimEnd();
    const content = cut.trimStart();
    if (content === "") continue; // comment-only line
    const indent = cut.length - content.length;
    if (indent % 2 !== 0) {
      fail(i + 1, "BAD_INDENT", `indentation must use 2 spaces; found ${indent} space(s) before "${content.slice(0, 24)}"`);
    }
    result.push({ line: i + 1, indent, text: content });
  }
  return result;
}

function parseDoubleQuoted(text: string, line: number): string {
  // text starts with '"'
  let out = "";
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      const next = text[i + 1];
      if (next === undefined) fail(line, "INVALID_SCALAR", "unterminated double-quoted string");
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else if (next === '"') out += '"';
      else if (next === "\\") out += "\\";
      else fail(line, "INVALID_ESCAPE", `unsupported escape sequence "\\${next}" in double-quoted string`);
      i++;
      continue;
    }
    if (ch === '"') {
      const rest = text.slice(i + 1);
      if (rest.trim() !== "") fail(line, "INVALID_SCALAR", `unexpected content after closing quote: "${rest.trim()}"`);
      return out;
    }
    out += ch;
  }
  fail(line, "INVALID_SCALAR", "unterminated double-quoted string");
}

function parseSingleQuoted(text: string, line: number): string {
  // text starts and must end with '; '' is an escaped quote
  if (text.length < 2 || !text.endsWith("'")) {
    fail(line, "INVALID_SCALAR", "unterminated single-quoted string");
  }
  const inner = text.slice(1, -1);
  if (inner.includes("'") && !inner.includes("''")) {
    fail(line, "INVALID_SCALAR", "unescaped single quote inside single-quoted string (use '' to escape)");
  }
  return inner.replace(/''/g, "'");
}

function rejectSpecialPrefix(text: string, line: number): void {
  const ch = text[0];
  if (ch === "&") fail(line, "ANCHOR", "anchors (&) are not supported in this YAML subset");
  if (ch === "*") fail(line, "ALIAS", "aliases (*) are not supported in this YAML subset");
  if (ch === "!") fail(line, "TAG", "tags (!) are not supported in this YAML subset");
  if (ch === "[" || ch === "{") fail(line, "FLOW_STYLE", "flow style ([...] / {...}) is not supported; use indented block syntax");
  if (ch === "|" || ch === ">") fail(line, "BLOCK_SCALAR", "block scalars (| and >) are not supported; quote the string instead");
}

function parseScalarValue(text: string, line: number): YamlScalar {
  if (text.startsWith('"')) return parseDoubleQuoted(text, line);
  if (text.startsWith("'")) return parseSingleQuoted(text, line);
  rejectSpecialPrefix(text, line);
  if (text.startsWith("- ")) {
    fail(line, "INVALID_SCALAR", `unexpected "- " at the start of a value: "${text.slice(0, 24)}"`);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (INT_RE.test(text)) {
    const n = Number(text);
    return n === 0 ? 0 : n; // normalize -0 to 0 for stable round-trips
  }
  return text;
}

function parseScalarString(text: string, line: number): string {
  if (text.startsWith('"')) return parseDoubleQuoted(text, line);
  if (text.startsWith("'")) return parseSingleQuoted(text, line);
  rejectSpecialPrefix(text, line);
  if (text.startsWith("- ")) {
    fail(line, "INVALID_SCALAR", `unexpected "- " at the start of a sequence item: "${text.slice(0, 24)}"`);
  }
  return text; // sequence items stay strings, even "true"/"123"
}

class Parser {
  private pos = 0;

  constructor(private readonly lines: SignifLine[]) {}

  parseDocument(): YamlMap {
    if (this.lines.length === 0) return {};
    const first = this.lines[0];
    if (first.indent !== 0) {
      fail(first.line, "BAD_INDENT", `the document must start at indentation 0 (found ${first.indent})`);
    }
    if (first.text.startsWith(SEQ_PREFIX)) {
      fail(first.line, "NOT_A_MAP", "the top-level structure must be a map, not a sequence");
    }
    return this.parseMap(0);
  }

  private current(): SignifLine | undefined {
    return this.lines[this.pos];
  }

  private parseMap(indent: number): YamlMap {
    const map: YamlMap = {};
    while (this.pos < this.lines.length) {
      const ln = this.lines[this.pos];
      if (ln.indent < indent) break; // dedent: caller continues
      if (ln.indent > indent) {
        fail(ln.line, "BAD_INDENT", `unexpected indentation ${ln.indent}; expected ${indent} for a map key or ${indent + 2} for a nested block`);
      }
      if (ln.text.startsWith(SEQ_PREFIX)) {
        fail(ln.line, "UNEXPECTED_SEQUENCE", `sequence item "- ..." cannot appear here; expected a "key: value" entry`);
      }
      const m = KEY_RE.exec(ln.text);
      if (!m) {
        fail(ln.line, "INVALID_ENTRY", `expected "key: value" or "key:" (keys match [A-Za-z0-9_-]+); found "${ln.text.slice(0, 32)}"`);
      }
      const key = m[1];
      const valueText = m[2];
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        fail(ln.line, "DUPLICATE_KEY", `duplicate key "${key}"`);
      }
      this.pos++;
      if (valueText === undefined || valueText.trim() === "") {
        const child = this.current();
        if (child === undefined || child.indent <= indent) {
          fail(ln.line, "EMPTY_VALUE", `"${key}:" requires a value or an indented block on the next lines`);
        }
        if (child.indent !== indent + 2) {
          fail(child.line, "BAD_INDENT", `bad indentation jump: expected ${indent + 2} spaces under "${key}", found ${child.indent}`);
        }
        // a bare "-" (no item text) also selects the sequence context so that
        // it fails inside parseSequence with EXPECTED_SEQUENCE_ITEM
        if (child.text.startsWith(SEQ_PREFIX) || child.text === "-") {
          map[key] = this.parseSequence(indent + 2);
        } else {
          map[key] = this.parseMap(indent + 2);
        }
      } else {
        map[key] = parseScalarValue(valueText.trim(), ln.line);
      }
    }
    return map;
  }

  private parseSequence(indent: number): string[] {
    const items: string[] = [];
    while (this.pos < this.lines.length) {
      const ln = this.lines[this.pos];
      if (ln.indent < indent) break; // dedent: caller continues
      if (ln.indent > indent) {
        fail(ln.line, "BAD_INDENT", `unexpected indentation ${ln.indent}; expected ${indent} for a sequence item`);
      }
      if (!ln.text.startsWith(SEQ_PREFIX)) {
        fail(ln.line, "EXPECTED_SEQUENCE_ITEM", `expected a "- item" entry at indentation ${indent}; found "${ln.text.slice(0, 32)}"`);
      }
      const value = ln.text.slice(2).trim();
      if (value === "") {
        fail(ln.line, "EMPTY_SEQUENCE_ITEM", "sequence item is empty; expected \"- value\"");
      }
      items.push(parseScalarString(value, ln.line));
      this.pos++;
    }
    return items;
  }
}

/**
 * Parse a YAML document in the kit subset.
 * @throws YamlParseError with `.line` and `.code` on any unsupported syntax.
 */
export function parseYaml(text: string): YamlMap {
  const lines = toSignificantLines(text);
  return new Parser(lines).parseDocument();
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const SPECIAL_START = /^["'&*!|>[{#%@`]/;

function needsQuote(s: string): boolean {
  if (s === "") return true;
  if (s !== s.trim()) return true;
  if (s === "true" || s === "false") return true;
  if (INT_RE.test(s)) return true;
  if (SPECIAL_START.test(s)) return true;
  if (s.startsWith("- ") || s.startsWith("? ")) return true;
  if (s.includes(": ") || s.endsWith(":")) return true;
  if (s.includes(" #")) return true;
  if (/[\n\r\t]/.test(s)) return true;
  return false;
}

function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (ch.charCodeAt(0) < 0x20) {
      throw new TypeError(`cannot serialize control character U+${ch.charCodeAt(0).toString(16)} in the kit YAML subset`);
    } else out += ch;
  }
  return out + '"';
}

function scalarToText(value: YamlScalar): string {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`cannot serialize non-integer number ${value}; the kit YAML subset supports integers only`);
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return needsQuote(value) ? quote(value) : value;
}

function serializeValue(value: YamlValue, indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new TypeError("cannot serialize an empty sequence; the kit YAML subset cannot represent [] (omit the key instead)");
    }
    for (const item of value) {
      if (typeof item !== "string") {
        throw new TypeError("sequences may only contain strings in the kit YAML subset");
      }
      lines.push(`${pad}- ${scalarToText(item)}`);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      throw new TypeError("cannot serialize an empty map; the kit YAML subset cannot represent {} (omit the key instead)");
    }
    for (const [k, v] of entries) {
      if (!/^[A-Za-z0-9_-]+$/.test(k)) {
        throw new TypeError(`key "${k}" does not match [A-Za-z0-9_-]+ and cannot be serialized`);
      }
      if (v === null || v === undefined) {
        throw new TypeError(`key "${k}" has no value; null is not part of the kit YAML subset`);
      }
      if (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 0) {
        lines.push(`${pad}${k}:`);
        serializeValue(v, indent + 2, lines);
      } else if (Array.isArray(v) && v.length > 0) {
        lines.push(`${pad}${k}:`);
        serializeValue(v, indent + 2, lines);
      } else {
        lines.push(`${pad}${k}: ${scalarToText(v as YamlScalar)}`);
      }
    }
    return;
  }
  lines.push(`${pad}${scalarToText(value)}`);
}

/**
 * Serialize a value into canonical 2-space-indented YAML in the kit subset.
 * `parseYaml(serializeProfile(x))` deep-equals `x` for every representable
 * `x` (maps of scalars, integers, booleans and string sequences; empty
 * maps/sequences cannot be represented and throw).
 */
export function serializeProfile(value: YamlMap): string {
  const lines: string[] = [];
  serializeValue(value, 0, lines);
  return lines.join("\n") + "\n";
}
