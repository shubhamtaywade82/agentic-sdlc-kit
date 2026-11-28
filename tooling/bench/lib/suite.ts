// tooling/bench/lib/suite.ts
//
// Suite schema, loader, and validation for the self-hosted regression
// benchmark (ADR-0023). Suites are declarative YAML pinned in the
// repository like a lockfile: adding or editing a task is a reviewed
// change, and the `version` field is the pin.
//
// Fail-closed rules (a suite that loads half-way is worse than one that
// refuses to load):
//   - unknown keys are hard errors (typo'd settings are visible now, not
//     silently defaulted at run time);
//   - task ids, workflows, and stacks are validated here;
//   - the driver declared in the suite must be one the harness supports.

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Minimal YAML subset parser (same philosophy as the profile serializer in
// packages/core: clean YAML without external dependencies). Supported:
//   key: value            plain / single- / double-quoted scalars
//   key: |                block scalars (multi-line, dedented)
//   key:                  nested map (deeper indent) or nested list
//   - 'item'              list scalars
//   - key: value          list of maps (first pair on the dash line)
//   # comments, blank lines
// Anything else is a hard error with the line number — a suite that loads
// half-way is worse than one that refuses to load.
// ---------------------------------------------------------------------------

interface Line {
  readonly raw: string;
  readonly text: string; // comment-stripped, right-trimmed
  readonly indent: number;
  readonly no: number;
}

function stripComment(line: string): string {
  // Only strip a # outside quotes (suite tickets legitimately contain none,
  // but being conservative costs little).
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || line[i - 1] === ' ')) return line.slice(0, i);
  }
  return line;
}

function toLines(yaml: string): Line[] {
  return yaml
    .split('\n')
    .map((raw, i) => {
      const text = stripComment(raw).trimEnd();
      return { raw, text, indent: text.length - text.trimStart().length, no: i + 1 };
    })
    .filter((l) => l.text.trim() !== '');
}

function unquote(value: string, no: number): string {
  const t = value.trim();
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  if (/[:#]{1}/.test(t.slice(1)) && !/^["']/.test(t) && /:($|\s)/.test(t)) {
    throw new SuiteError(`line ${no}: ambiguous plain scalar '${t}' — quote it`);
  }
  return t;
}

const KV = /^([A-Za-z][\w-]*):\s*(.*)$/;
const DASH_MAP = /^- ([A-Za-z][\w-]*):\s*(.*)$/;
const DASH_SCALAR = /^-\s+(.*)$/;

/** Type a scalar the way YAML does: plain true/false are booleans,
 * everything else stays a string (numbers are coerced by the consumer). */
function parseScalar(value: string, no: number): string | boolean {
  const t = value.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  return unquote(t, no);
}

class Parser {
  private i = 0;
  constructor(private readonly lines: readonly Line[]) {}

  private peek(): Line | undefined {
    return this.lines[this.i];
  }

  /** Parse a block at the given indent; stops at a line with indent < min. */
  parseBlock(min: number): unknown {
    const first = this.peek();
    if (first === undefined || first.indent < min) return undefined;
    if (first.text.trimStart().startsWith('- ')) return this.parseList(first.indent);
    return this.parseMap(first.indent);
  }

  private parseMap(indent: number): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (;;) {
      const line = this.peek();
      if (line === undefined || line.indent < indent) break;
      if (line.indent > indent) {
        throw new SuiteError(`line ${line.no}: unexpected indent under a mapping`);
      }
      const m = KV.exec(line.text.trim());
      if (!m || !m[1]) {
        throw new SuiteError(`line ${line.no}: cannot parse '${line.text.trim()}'`);
      }
      const key = m[1]!;
      const rest = (m[2] ?? '').trim();
      if (rest === '|') {
        this.i++;
        out[key] = this.parseBlockScalar(indent);
      } else if (rest === '') {
        this.i++;
        // Nested block (map or list) or an empty value at end of file.
        const next = this.peek();
        if (next !== undefined && next.indent > indent) {
          out[key] = this.parseBlock(next.indent);
        } else if (
          next !== undefined &&
          next.indent === indent &&
          next.text.trimStart().startsWith('- ')
        ) {
          out[key] = this.parseList(indent);
        } else {
          out[key] = null;
        }
      } else {
        this.i++;
        out[key] = parseScalar(rest, line.no);
      }
    }
    return out;
  }

  private parseList(indent: number): unknown[] {
    const items: unknown[] = [];
    for (;;) {
      const line = this.peek();
      if (line === undefined || line.indent < indent) break;
      if (line.indent > indent) {
        throw new SuiteError(`line ${line.no}: unexpected indent in a list`);
      }
      const trimmed = line.text.trim();
      if (!trimmed.startsWith('- ')) break; // not our list — caller decides
      const dm = DASH_MAP.exec(trimmed);
      if (dm && dm[1]) {
        // List-of-maps item: first pair on the dash line, the rest of the
        // map is indented to (dash indent + 2).
        const innerIndent = indent + 2;
        this.lines[this.i] = {
          ...line,
          text: `${' '.repeat(innerIndent)}${dm[1]}: ${dm[2] ?? ''}`.trimEnd(),
          indent: innerIndent,
        };
        items.push(this.parseMap(innerIndent));
        continue;
      }
      const ds = DASH_SCALAR.exec(trimmed);
      if (!ds) {
        throw new SuiteError(`line ${line.no}: cannot parse list item '${trimmed}'`);
      }
      const scalar = (ds[1] ?? '').trim();
      this.i++;
      items.push(scalar === '|' ? this.parseBlockScalar(indent) : parseScalar(scalar, line.no));
    }
    return items;
  }

  private parseBlockScalar(keyIndent: number): string {
    const content: string[] = [];
    let blockIndent: number | null = null;
    for (;;) {
      const line = this.peek();
      if (line === undefined || line.indent <= keyIndent) break;
      if (blockIndent === null) blockIndent = line.indent;
      if (line.indent < blockIndent) {
        throw new SuiteError(`line ${line.no}: inconsistent block scalar indent`);
      }
      content.push(line.raw.trimEnd().slice(blockIndent));
      this.i++;
    }
    // Block scalars keep their lines and end with a newline; trim the
    // trailing blank padding for stable comparisons.
    return `${content.join('\n')}\n`.trim() + '\n';
  }
}

/** Parse the YAML subset used by bench suites into a JSON value. */
export function parseYamlSubset(yaml: string): unknown {
  const lines = toLines(yaml);
  if (lines.length === 0) return undefined;
  const parser = new Parser(lines);
  return parser.parseBlock(0);
}

export const WORKFLOWS = ['feature', 'fix', 'refactor'] as const;
export type BenchWorkflow = (typeof WORKFLOWS)[number];

export const STACKS_WITH_TEMPLATES = ['node-typescript', 'python'] as const;
export type BenchStack = (typeof STACKS_WITH_TEMPLATES)[number];

/** The pinned model configuration recorded in every report (used by a
 * provider driver; the scripted driver records it as "would-be"). */
export interface ModelConfig {
  readonly provider: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTurns: number;
  readonly tokenBudget: number;
}

export interface BenchTaskDef {
  /** Stable corpus id (used in reports, baselines, and rotation notes). */
  readonly id: string;
  readonly workflow: BenchWorkflow;
  readonly stack: BenchStack;
  readonly title: string;
  /** Ticket text as an agent would receive it. */
  readonly ticket: string;
  readonly acceptanceCriteria: readonly string[];
  /** The content the scripted agent must produce at green. */
  readonly expected: string;
  /** Wrong solutions the scripted agent tries first (exercises retries). */
  readonly failedAttempts?: readonly string[];
  /** The scripted agent never produces the solution — the task MUST fail
   * (pins the harness's ability to score a lying agent as failed). */
  readonly neverSolves?: boolean;
  /** Hold-out tasks: excluded from prompt/workflow tuning; rotation pool. */
  readonly holdout?: boolean;
}

export interface BenchSuite {
  readonly suite: string;
  readonly version: number;
  readonly description: string;
  readonly driver: string;
  readonly modelConfig: ModelConfig;
  readonly defaults: { readonly maxPhaseAttempts: number };
  readonly tasks: readonly BenchTaskDef[];
}

const WORKFLOW_SET = new Set<string>(WORKFLOWS);
const STACK_SET = new Set<string>(STACKS_WITH_TEMPLATES);

interface RawTask {
  [key: string]: unknown;
}

export class SuiteError extends Error {}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SuiteError(`${where} must be a non-empty string`);
  }
  return value;
}

function parseTask(raw: RawTask, index: number): BenchTaskDef {
  const where = `task ${index + 1}`;
  const unknown = Object.keys(raw).filter(
    (k) =>
      ![
        'id',
        'workflow',
        'stack',
        'title',
        'ticket',
        'acceptanceCriteria',
        'expected',
        'failedAttempts',
        'neverSolves',
        'holdout',
      ].includes(k),
  );
  if (unknown.length > 0) {
    throw new SuiteError(`${where}: unknown key(s) ${unknown.join(', ')}`);
  }
  const id = str(raw['id'], `${where} id`);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) {
    throw new SuiteError(`${where}: id must be lowercase kebab-case (got '${id}')`);
  }
  const workflow = str(raw['workflow'], `${where} (${id}) workflow`);
  if (!WORKFLOW_SET.has(workflow)) {
    throw new SuiteError(
      `${where} (${id}): workflow must be one of ${[...WORKFLOW_SET].join(', ')} (got '${workflow}')`,
    );
  }
  const stack = str(raw['stack'], `${where} (${id}) stack`);
  if (!STACK_SET.has(stack)) {
    throw new SuiteError(
      `${where} (${id}): stack must be one of ${STACKS_WITH_TEMPLATES.join(', ')} (got '${stack}')`,
    );
  }
  const criteria = raw['acceptanceCriteria'];
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new SuiteError(`${where} (${id}): acceptanceCriteria must be a non-empty list`);
  }
  for (const c of criteria) {
    if (typeof c !== 'string' || c.trim().length < 5) {
      throw new SuiteError(`${where} (${id}): acceptance criteria must be strings of >= 5 chars`);
    }
  }
  const failed = raw['failedAttempts'];
  if (
    failed !== undefined &&
    (!Array.isArray(failed) || failed.some((f) => typeof f !== 'string'))
  ) {
    throw new SuiteError(`${where} (${id}): failedAttempts must be a list of strings`);
  }
  return {
    id,
    workflow: workflow as BenchWorkflow,
    stack: stack as BenchStack,
    title: str(raw['title'], `${where} (${id}) title`),
    ticket: str(raw['ticket'], `${where} (${id}) ticket`),
    acceptanceCriteria: criteria.map((c) => String(c)),
    expected: str(raw['expected'], `${where} (${id}) expected`),
    ...(failed !== undefined ? { failedAttempts: (failed as string[]).map(String) } : {}),
    ...(raw['neverSolves'] === true ? { neverSolves: true } : {}),
    ...(raw['holdout'] === true ? { holdout: true } : {}),
  };
}

/** Parse a suite document (already-loaded YAML object). Validated strictly. */
export function parseSuite(doc: unknown, source: string): BenchSuite {
  if (typeof doc !== 'object' || doc === null) {
    throw new SuiteError(`${source}: suite must be a YAML mapping`);
  }
  const raw = doc as Record<string, unknown>;
  const known = ['suite', 'version', 'description', 'driver', 'modelConfig', 'defaults', 'tasks'];
  const unknown = Object.keys(raw).filter((k) => !known.includes(k));
  if (unknown.length > 0) {
    throw new SuiteError(`${source}: unknown key(s) ${unknown.join(', ')}`);
  }
  const modelRaw = (raw['modelConfig'] ?? {}) as Record<string, unknown>;
  const modelConfig: ModelConfig = {
    provider: str(modelRaw['provider'], `${source} modelConfig.provider`),
    model: str(modelRaw['model'], `${source} modelConfig.model`),
    temperature: Number(modelRaw['temperature'] ?? 0),
    maxTurns: Number(modelRaw['maxTurns'] ?? 24),
    tokenBudget: Number(modelRaw['tokenBudget'] ?? 200_000),
  };
  if (!Number.isFinite(modelConfig.temperature) || modelConfig.temperature < 0) {
    throw new SuiteError(`${source}: modelConfig.temperature must be >= 0`);
  }
  const defaultsRaw = (raw['defaults'] ?? {}) as Record<string, unknown>;
  const maxPhaseAttempts = Number(defaultsRaw['maxPhaseAttempts'] ?? 3);
  if (!Number.isInteger(maxPhaseAttempts) || maxPhaseAttempts < 1) {
    throw new SuiteError(`${source}: defaults.maxPhaseAttempts must be an integer >= 1`);
  }
  const driver = str(raw['driver'], `${source} driver`);
  if (driver !== 'scripted' && !driver.startsWith('provider:')) {
    throw new SuiteError(`${source}: driver must be 'scripted' or 'provider:<id>' (got '${driver}')`);
  }
  const tasksRaw = raw['tasks'];
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
    throw new SuiteError(`${source}: tasks must be a non-empty list`);
  }
  const tasks = tasksRaw.map((t, i) => parseTask(t as RawTask, i));
  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.id)) throw new SuiteError(`${source}: duplicate task id '${t.id}'`);
    seen.add(t.id);
  }
  return {
    suite: str(raw['suite'], `${source} suite`),
    version: Number(raw['version'] ?? 1),
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    driver,
    modelConfig,
    defaults: { maxPhaseAttempts },
    tasks,
  };
}

/** Load and validate a suite YAML file from the suites directory. */
export async function loadSuite(root: string, name: string): Promise<BenchSuite> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new SuiteError(`invalid suite name '${name}'`);
  }
  const file = path.join(root, 'tooling', 'bench', 'suites', `${name}.yaml`);
  const text = await fs.readFile(file, 'utf8');
  let doc: unknown;
  try {
    doc = parseYamlSubset(text);
  } catch (err) {
    throw new SuiteError(
      `${file}: invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseSuite(doc, file);
}
