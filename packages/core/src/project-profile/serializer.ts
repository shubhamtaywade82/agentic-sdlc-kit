// packages/core/src/project-profile/serializer.ts
//
// Deterministic YAML serializer and parser for ProjectProfile (.ai-kit/project.yml).
// Generates and parses clean YAML without external dependencies.
//
// Parser contract (strict, no silent drops):
//   - Accepts the serializer's own output (block style, single-quoted flow
//     arrays) AND the common hand-written variants: double-quoted JSON
//     arrays, unquoted plain scalars, and flow-style category values
//     (`test: ['node', '--test']`).
//   - Anything that looks like a command entry but cannot be parsed is a
//     HARD ERROR with the line number — never silently dropped. (A dropped
//     command silently turns `kit verify` into BLOCKED with zero checks.)

import {
  Errors,
  type ProjectProfile,
  type Result,
  type StrengthGateMode,
  type StrengthScope,
  type StrengthSettings,
} from '@agentic-sdlc-kit/contracts';
import { validateProfile } from './validator.js';

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'name',
  'stack',
  'commands',
  'verification',
]);
const COMMAND_CATEGORIES = new Set(['test', 'lint', 'typecheck', 'build']);
const STRENGTH_SETTINGS_KEYS = new Set(['enabled', 'threshold', 'budgetMs', 'scope', 'gateMode']);
const STRENGTH_SCOPES = new Set<StrengthScope>(['diff', 'suite']);
const STRENGTH_GATE_MODES = new Set<StrengthGateMode>(['warn', 'enforce']);

/** Strict boolean scalar: only true/false, never a truthy string. */
function parseStrictBoolean(value: string, lineNo: number, key: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ProfileParseError(`line ${lineNo}: ${key} must be true or false, got "${value}"`);
}

function quoteYamlSingle(s: string): string {
  // YAML single-quoted scalar: escape ' by doubling.
  return `'${s.replace(/'/g, "''")}'`;
}

export function serializeProfileToYaml(profile: ProjectProfile): string {
  const lines: string[] = [];
  lines.push(`schemaVersion: ${profile.schemaVersion}`);
  lines.push(`name: ${profile.name}`);
  lines.push('stack:');
  for (const s of profile.stack) {
    lines.push(`  - ${s}`);
  }

  const entries = Object.entries(profile.commands).filter(([, cmds]) => cmds && cmds.length > 0);
  if (entries.length === 0) {
    lines.push('commands: {}');
    return lines.join('\n') + '\n';
  }

  lines.push('commands:');
  for (const [category, cmds] of entries) {
    lines.push(`  ${category}:`);
    for (const cmd of cmds!) {
      lines.push(`    - [${cmd.map(quoteYamlSingle).join(', ')}]`);
    }
  }

  if (profile.verification?.strength) {
    const s = profile.verification.strength;
    lines.push('verification:');
    lines.push('  strength:');
    lines.push(`    enabled: ${s.enabled}`);
    lines.push(`    threshold: ${s.threshold}`);
    lines.push(`    budgetMs: ${s.budgetMs}`);
    lines.push(`    scope: ${s.scope}`);
    lines.push(`    gateMode: ${s.gateMode}`);
  }

  return lines.join('\n') + '\n';
}

export const serializeProfileYaml = serializeProfileToYaml;

/** Strip a trailing YAML comment, respecting single/double quoted strings. */
function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (quote === "'" && ch === "'" && line[i + 1] === "'") {
        i++; // escaped single quote
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Parse a YAML flow-style array: `['a', 'b']`, `["a", "b"]`, `[a, b]`, `[]`.
 * Returns null when the input is not a bracketed flow sequence.
 */
function parseFlowArray(s: string): string[] | null {
  const t = s.trim();
  if (!t.startsWith('[') || !t.endsWith(']')) return null;
  const inner = t.slice(1, -1).trim();
  if (inner === '') return [];
  const items: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (quote === "'" && ch === "'" && inner[i + 1] === "'") {
        cur += "'";
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      items.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '' || items.length > 0) {
    if (cur.trim() !== '') items.push(cur.trim());
  }
  return items;
}

function unquote(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

class ProfileParseError extends Error {}

/**
 * Parse the `verification:` section (ADR-0022). Strict: every key must be
 * known, every value must be a valid scalar. A typo'd key is a HARD ERROR
 * so a misconfigured strength gate is visible immediately, never silently
 * ignored (fail closed — the same rule as commands).
 */
function parseVerificationSection(
  lines: readonly { readonly raw: string; readonly lineNo: number; readonly indent: number }[],
  index: number,
): { verification: NonNullable<ProjectProfile['verification']>; next: number } {
  const strength: Partial<Record<keyof StrengthSettings, unknown>> = {};
  let inStrength = false;
  let i = index;
  while (i < lines.length) {
    const { raw, lineNo } = lines[i]!;
    const line = stripComment(raw).trim();
    const indent = raw.length - raw.trimStart().length;
    if (!line) {
      i++;
      continue;
    }
    // Indent 0: a new top-level key ends the verification section.
    if (indent === 0) break;

    const kv = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!kv || !kv[1]) {
      throw new ProfileParseError(`line ${lineNo}: cannot parse "${line}" under verification:`);
    }
    const key = kv[1];
    const rest = kv[2]?.trim() ?? '';

    if (!inStrength) {
      if (key !== 'strength' || (indent !== 2 && indent !== 4)) {
        throw new ProfileParseError(
          `line ${lineNo}: unsupported key "${key}" under verification: (expected strength)`,
        );
      }
      if (rest) {
        throw new ProfileParseError(`line ${lineNo}: strength must be a mapping, got "${rest}"`);
      }
      inStrength = true;
      i++;
      continue;
    }

    if (!STRENGTH_SETTINGS_KEYS.has(key)) {
      throw new ProfileParseError(
        `line ${lineNo}: unknown strength setting "${key}" (expected one of: ${[...STRENGTH_SETTINGS_KEYS].join(', ')})`,
      );
    }
    if (!rest) {
      throw new ProfileParseError(`line ${lineNo}: strength setting "${key}" requires a value`);
    }
    switch (key) {
      case 'enabled':
        strength.enabled = parseStrictBoolean(rest, lineNo, 'strength.enabled');
        break;
      case 'threshold': {
        const n = Number.parseInt(rest, 10);
        if (Number.isNaN(n)) {
          throw new ProfileParseError(
            `line ${lineNo}: threshold must be an integer, got "${rest}"`,
          );
        }
        strength.threshold = n;
        break;
      }
      case 'budgetMs': {
        const n = Number.parseInt(rest, 10);
        if (Number.isNaN(n)) {
          throw new ProfileParseError(`line ${lineNo}: budgetMs must be an integer, got "${rest}"`);
        }
        strength.budgetMs = n;
        break;
      }
      case 'scope': {
        if (!STRENGTH_SCOPES.has(rest as StrengthScope)) {
          throw new ProfileParseError(`line ${lineNo}: scope must be diff or suite, got "${rest}"`);
        }
        strength.scope = rest as StrengthScope;
        break;
      }
      case 'gateMode': {
        if (!STRENGTH_GATE_MODES.has(rest as StrengthGateMode)) {
          throw new ProfileParseError(
            `line ${lineNo}: gateMode must be warn or enforce, got "${rest}"`,
          );
        }
        strength.gateMode = rest as StrengthGateMode;
        break;
      }
    }
    i++;
  }

  // Schema validation catches partial strength blocks (missing keys);
  // assembling here keeps the parse layer dumb and the schema authoritative.
  const verification: NonNullable<ProjectProfile['verification']> = {};
  if (inStrength) {
    verification.strength = {
      enabled: strength.enabled as boolean,
      threshold: strength.threshold as number,
      budgetMs: strength.budgetMs as number,
      scope: strength.scope as StrengthScope,
      gateMode: strength.gateMode as StrengthGateMode,
    };
  }
  return { verification, next: i };
}

function parseYamlLines(yaml: string): {
  schemaVersion: number;
  name: string;
  stack: string[];
  commands: ProjectProfile['commands'];
  verification?: NonNullable<ProjectProfile['verification']>;
} {
  let schemaVersion = 1;
  let name = 'unnamed';
  const stack: string[] = [];
  const commands: ProjectProfile['commands'] = {};
  let verification: NonNullable<ProjectProfile['verification']> | undefined;

  let inCommands = false;
  let currentCategory: keyof ProjectProfile['commands'] | null = null;
  const rawLines = yaml.split('\n');
  const lines = rawLines.map((raw, idx) => ({
    raw,
    lineNo: idx + 1,
    indent: raw.length - raw.trimStart().length,
  }));

  for (let idx = 0; idx < lines.length; idx++) {
    const entry = lines[idx]!;
    const rawLine = stripComment(entry.raw);
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const lineNo = entry.lineNo;
    const indent = line.length - line.trimStart().length;

    // Top-level keys (indent 0).
    if (indent === 0) {
      const m = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(line.trim());
      if (!m || !m[1]) {
        throw new ProfileParseError(`line ${lineNo}: cannot parse "${line.trim()}"`);
      }
      const key = m[1];
      const rest = m[2]?.trim() ?? '';
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
        throw new ProfileParseError(
          `line ${lineNo}: unsupported key "${key}" (expected one of: ${[...KNOWN_TOP_LEVEL_KEYS].join(', ')})`,
        );
      }
      if (key === 'schemaVersion') {
        const n = Number.parseInt(rest, 10);
        if (Number.isNaN(n)) {
          throw new ProfileParseError(`line ${lineNo}: schemaVersion must be an integer`);
        }
        schemaVersion = n;
      } else if (key === 'name') {
        // No silent default: an empty name fails schema validation with a
        // clear error (the profile is a placeholder until `kit init` runs).
        name = unquote(rest);
      } else if (key === 'stack') {
        if (rest) {
          const flow = parseFlowArray(rest);
          if (flow) {
            stack.push(...flow.map(unquote));
          } else {
            throw new ProfileParseError(`line ${lineNo}: cannot parse stack value "${rest}"`);
          }
        }
      } else if (key === 'commands') {
        inCommands = true;
        currentCategory = null;
        if (rest && rest !== '{}') {
          throw new ProfileParseError(
            `line ${lineNo}: expected "commands:" or "commands: {}" but got "${rest}"`,
          );
        }
      } else if (key === 'verification') {
        if (rest && rest !== '{}') {
          throw new ProfileParseError(
            `line ${lineNo}: expected "verification:" or "verification: {}" but got "${rest}"`,
          );
        }
        const parsed = parseVerificationSection(
          lines.slice(idx + 1).map((e) => ({
            raw: e.raw,
            lineNo: e.lineNo,
            indent: e.indent,
          })),
          0,
        );
        verification = parsed.verification;
        idx += parsed.next;
      }
      continue;
    }

    // Nested lines (indent > 0).
    const trimmed = line.trim();
    if (trimmed === 'commands: {}') continue;

    if (!inCommands) {
      // Still in the stack section (or unknown nesting before commands).
      if (trimmed.startsWith('- ')) {
        stack.push(unquote(trimmed.slice(2)));
        continue;
      }
      throw new ProfileParseError(
        `line ${lineNo}: unexpected content before "commands:" — "${trimmed}"`,
      );
    }

    // Category line: `  test:` or `  test: ['node', '--test']` or `  test: []`.
    const catMatch = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(trimmed);
    if (catMatch && catMatch[1] && indent <= 3 && !trimmed.startsWith('- ')) {
      const cat = catMatch[1];
      if (!COMMAND_CATEGORIES.has(cat)) {
        throw new ProfileParseError(
          `line ${lineNo}: unknown command category "${cat}" (expected one of: ${[...COMMAND_CATEGORIES].join(', ')})`,
        );
      }
      currentCategory = cat as keyof ProjectProfile['commands'];
      if (!commands[currentCategory]) commands[currentCategory] = [];
      const rest = catMatch[2]?.trim() ?? '';
      if (rest) {
        const flow = parseFlowArray(rest);
        if (!flow) {
          throw new ProfileParseError(
            `line ${lineNo}: cannot parse ${cat} value "${rest}" (expected a list like ['node', '--test'])`,
          );
        }
        if (flow.length > 0) {
          commands[currentCategory]!.push(flow.map(unquote));
        }
      }
      continue;
    }

    // Entry line: `    - ['node', '--test']` / `    - ["node","--test"]` /
    // `    - node --test` / `    - "node --test"`.
    if (trimmed.startsWith('- ')) {
      if (!currentCategory) {
        throw new ProfileParseError(
          `line ${lineNo}: command entry outside a category — "${trimmed}"`,
        );
      }
      const rest = trimmed.slice(2).trim();
      if (!rest) {
        throw new ProfileParseError(`line ${lineNo}: empty command entry`);
      }
      const flow = parseFlowArray(rest);
      if (flow) {
        if (flow.length === 0) {
          throw new ProfileParseError(
            `line ${lineNo}: empty command array (remove the entry or provide a command)`,
          );
        }
        commands[currentCategory]!.push(flow.map(unquote));
      } else {
        // Plain or quoted scalar: split on whitespace into an argv array.
        const argv = unquote(rest).split(/\s+/).filter(Boolean);
        if (argv.length === 0) {
          throw new ProfileParseError(`line ${lineNo}: cannot parse command entry "${rest}"`);
        }
        commands[currentCategory]!.push(argv);
      }
      continue;
    }

    throw new ProfileParseError(
      `line ${lineNo}: cannot parse "${trimmed}" under commands: (expected "<category>:" or "- <command>")`,
    );
  }

  return {
    schemaVersion,
    name,
    stack,
    commands,
    ...(verification !== undefined ? { verification } : {}),
  };
}

export function parseProfileFromYaml(yaml: string): Result<ProjectProfile> {
  try {
    const candidate = parseYamlLines(yaml);
    return validateProfile(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: Errors.profileInvalid(`Failed to parse profile YAML: ${msg}`) };
  }
}

export const parseProfileYaml = parseProfileFromYaml;
