/**
 * run-observer — event constructors, JSONL record types and the summary used
 * by the /kit:status command (pure policy, no $ usage).
 *
 * Record shape: { ts: number, kind: string, fields: {...} } — one JSON object
 * per line in `.ai/reports/runs/<sessionId>.jsonl`. Fields are flat and
 * JSON-serializable; undefined values are dropped by JSON.stringify.
 */

export type RunRecordKind =
  | 'session-start'
  | 'tool-call'
  | 'turn-start'
  | 'turn-step'
  | 'turn-complete'
  | 'agent-spawn';

export interface RunRecord {
  /** Millisecond timestamp ($.clock.now()). */
  ts: number;
  kind: RunRecordKind;
  fields: { [key: string]: unknown };
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function sessionStart(ts: number, sessionId: string): RunRecord {
  return { ts, kind: 'session-start', fields: { sessionId } };
}

export function toolCall(ts: number, tool: string, ok: boolean, ms: number): RunRecord {
  return { ts, kind: 'tool-call', fields: { tool, ok, ms } };
}

export function turnStart(ts: number, turnId: string): RunRecord {
  return { ts, kind: 'turn-start', fields: { turnId } };
}

export function turnStep(
  ts: number,
  model: string,
  agentId: string,
  inputTokens?: number,
  outputTokens?: number,
): RunRecord {
  return { ts, kind: 'turn-step', fields: { model, agentId, inputTokens, outputTokens } };
}

export function turnComplete(
  ts: number,
  durationMs?: number,
  inputTokens?: number,
  outputTokens?: number,
  isAborted?: boolean,
  agentId?: string,
): RunRecord {
  return {
    ts,
    kind: 'turn-complete',
    fields: { durationMs, inputTokens, outputTokens, isAborted, agentId },
  };
}

export function agentSpawn(
  ts: number,
  name: string,
  model: string,
  isTeammate: boolean,
): RunRecord {
  return { ts, kind: 'agent-spawn', fields: { name, model, isTeammate } };
}

// ---------------------------------------------------------------------------
// JSONL (de)serialization
// ---------------------------------------------------------------------------

export function toLine(r: RunRecord): string {
  return JSON.stringify(r);
}

export function fromLine(line: string): RunRecord | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  try {
    const parsed = JSON.parse(trimmed) as { ts?: unknown; kind?: unknown; fields?: unknown };
    if (
      typeof parsed.ts !== 'number' ||
      typeof parsed.kind !== 'string' ||
      typeof parsed.fields !== 'object' ||
      parsed.fields === null
    ) {
      return null;
    }
    return { ts: parsed.ts, kind: parsed.kind as RunRecordKind, fields: parsed.fields as { [key: string]: unknown } };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Summary (for /kit:status)
// ---------------------------------------------------------------------------

export interface ToolStat {
  tool: string;
  ms: number;
  ok: boolean;
}

export interface AgentSpawnStat {
  name: string;
  model: string;
  isTeammate: boolean;
}

export interface RunSummary {
  /** Last record ts − first record ts. */
  sessionMs: number;
  toolCalls: number;
  failedToolCalls: number;
  slowestTools: ToolStat[];
  turns: number;
  modelRequests: number;
  modelsSeen: string[];
  /** Token counts from the LAST turn-complete record. */
  inputTokens?: number;
  outputTokens?: number;
  aborted: boolean;
  agentSpawns: AgentSpawnStat[];
}

export function summarizeStats(records: RunRecord[]): RunSummary {
  const summary: RunSummary = {
    sessionMs: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    slowestTools: [],
    turns: 0,
    modelRequests: 0,
    modelsSeen: [],
    aborted: false,
    agentSpawns: [],
  };
  if (records.length === 0) return summary;
  summary.sessionMs = Math.max(0, records[records.length - 1].ts - records[0].ts);

  const toolStats: ToolStat[] = [];
  const models: string[] = [];
  for (const r of records) {
    if (r.kind === 'tool-call') {
      const tool = typeof r.fields.tool === 'string' ? r.fields.tool : 'unknown';
      const ok = r.fields.ok !== false;
      const ms = typeof r.fields.ms === 'number' ? r.fields.ms : 0;
      summary.toolCalls++;
      if (!ok) summary.failedToolCalls++;
      toolStats.push({ tool, ms, ok });
    } else if (r.kind === 'turn-start') {
      summary.turns++;
    } else if (r.kind === 'turn-step') {
      summary.modelRequests++;
      const model = typeof r.fields.model === 'string' && r.fields.model !== '' ? r.fields.model : '';
      if (model !== '' && !models.includes(model)) models.push(model);
    } else if (r.kind === 'turn-complete') {
      if (typeof r.fields.inputTokens === 'number') summary.inputTokens = r.fields.inputTokens;
      if (typeof r.fields.outputTokens === 'number') summary.outputTokens = r.fields.outputTokens;
      if (r.fields.isAborted === true) summary.aborted = true;
    } else if (r.kind === 'agent-spawn') {
      summary.agentSpawns.push({
        name: typeof r.fields.name === 'string' ? r.fields.name : 'unnamed',
        model: typeof r.fields.model === 'string' ? r.fields.model : '',
        isTeammate: r.fields.isTeammate === true,
      });
    }
  }
  summary.modelsSeen = models;
  summary.slowestTools = toolStats.slice().sort((a, b) => b.ms - a.ms).slice(0, 3);
  return summary;
}

/**
 * The /kit:status answer: counts, slowest 3 tools, total turns, tokens from
 * the last completed turn, agents spawned, session duration — as text.
 */
export function summarize(records: RunRecord[]): string {
  return formatSummary(summarizeStats(records));
}

function humanizeMs(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return totalSeconds + 's';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return minutes + 'm ' + seconds + 's';
  const hours = Math.floor(minutes / 60);
  return hours + 'h ' + (minutes % 60) + 'm';
}

/** Human-readable summary printed by /kit:status (Claude reads this text). */
export function formatSummary(s: RunSummary): string {
  const lines: string[] = [];
  lines.push('kit run-observer — session summary');
  lines.push(
    'duration: ' +
      humanizeMs(s.sessionMs) +
      ' · turns: ' +
      s.turns +
      ' · model requests: ' +
      s.modelRequests,
  );
  const failed = s.failedToolCalls > 0 ? ' (' + s.failedToolCalls + ' failed)' : '';
  const slowest = s.slowestTools.map((t) => t.tool + ' ' + humanizeMs(t.ms)).join(', ');
  lines.push('tools: ' + s.toolCalls + ' calls' + failed + (slowest !== '' ? ' · slowest: ' + slowest : ''));
  if (s.inputTokens !== undefined || s.outputTokens !== undefined) {
    lines.push(
      'tokens (last turn): ' +
        (s.inputTokens ?? 0).toLocaleString('en-US') +
        ' in / ' +
        (s.outputTokens ?? 0).toLocaleString('en-US') +
        ' out',
    );
  }
  if (s.modelsSeen.length > 0) {
    lines.push('models: ' + s.modelsSeen.join(', '));
  }
  if (s.agentSpawns.length > 0) {
    const spawns = s.agentSpawns
      .map((a) => a.name + (a.model !== '' ? ' (' + a.model + ')' : '') + (a.isTeammate ? ' [teammate]' : ''))
      .join(', ');
    lines.push('agents spawned: ' + spawns);
  }
  if (s.aborted) {
    lines.push('note: at least one turn was aborted');
  }
  return lines.join('\n');
}
