// packages/cli/src/application/agent/providers/claude-code/stream-parser.ts
//
// Claude Code stream-json parser (ADR-0019 PR4).
//
// Feeds line-by-line: the provider reads the headless CLI's NDJSON stdout
// and hands each line here. The parser emits normalized OBSERVATIONS (init,
// text delta, tool use, tool result, final result) and never fabricates
// anything it did not see: unknown lines are counted and skipped, a missing
// final result is surfaced as `undefined` so the provider can report an
// honest `interrupted` instead of inventing a status.
//
// Tool-call capability inference uses the SAME mapping table as the
// permission derivation (permission-config.ts) — an event can only claim
// the capability that authorized the tool rule (ADR-0020 parity).

import {
  inferCapabilityFromToolUse,
  type ClaudeCodePermissionConfig,
} from './permission-config.js';

/** What the parser saw on one line. Never re-ordered; emitted in arrival order. */
export type StreamObservation =
  | { kind: 'init'; sessionId: string }
  | { kind: 'text-delta'; content: string }
  | { kind: 'tool-use'; toolCallId: string; toolName: string; input: unknown }
  | { kind: 'tool-result'; toolCallId: string; status: 'succeeded' | 'failed' | 'denied' }
  | { kind: 'result'; result: ClaudeFinalResult };

/** The normalized shape of Claude Code's final `result` object (honest subset). */
export interface ClaudeFinalResult {
  readonly subtype: string;
  readonly isError: boolean;
  readonly text: string;
  readonly sessionId: string | undefined;
  readonly durationMs: number | undefined;
  readonly numTurns: number | undefined;
  readonly totalCostUsd: number | undefined;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
}

export class ClaudeStreamParser {
  private readonly onObservation: (obs: StreamObservation) => void;
  private sessionAnnounced = false;
  private unknownLines = 0;

  constructor(onObservation: (obs: StreamObservation) => void) {
    this.onObservation = onObservation;
  }

  /** Feed one stdout line (already trimmed of the newline). */
  consume(line: string): void {
    if (line.length === 0) return;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      this.unknownLines += 1;
      return;
    }
    if (!obj || typeof obj !== 'object') {
      this.unknownLines += 1;
      return;
    }
    const rec = obj as Record<string, unknown>;

    if (rec.type === 'system' && rec.subtype === 'init') {
      const sessionId = typeof rec.session_id === 'string' ? rec.session_id : '';
      if (sessionId) {
        // Emit init once: providers replay it to late subscribers.
        if (!this.sessionAnnounced) {
          this.sessionAnnounced = true;
          this.onObservation({ kind: 'init', sessionId });
        }
      }
      return;
    }

    if (rec.type === 'assistant' || rec.type === 'user') {
      const content = contentBlocks(rec.message);
      if (rec.type === 'assistant') {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
            this.onObservation({ kind: 'text-delta', content: block.text });
          }
          if (block.type === 'tool_use') {
            const id = typeof block.id === 'string' ? block.id : '';
            const name = typeof block.name === 'string' ? block.name : '';
            if (id && name) {
              this.onObservation({ kind: 'tool-use', toolCallId: id, toolName: name, input: block.input });
            }
          }
        }
      } else {
        for (const block of content) {
          if (block.type === 'tool_result') {
            const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
            if (id) {
              this.onObservation({
                kind: 'tool-result',
                toolCallId: id,
                status: toolResultStatus(block),
              });
            }
          }
        }
      }
      return;
    }

    if (rec.type === 'result') {
      this.onObservation({ kind: 'result', result: normalizeFinalResult(rec) });
      return;
    }

    this.unknownLines += 1;
  }

  /** Honest count of lines the parser could not interpret. */
  unknownLineCount(): number {
    return this.unknownLines;
  }
}

function contentBlocks(message: unknown): Array<Record<string, unknown>> {
  if (!message || typeof message !== 'object') return [];
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b): b is Record<string, unknown> => !!b && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string',
  );
}

function toolResultStatus(block: Record<string, unknown>): 'succeeded' | 'failed' | 'denied' {
  if (block.is_error === true) {
    const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
    if (/permission|not allowed|denied|unauthorized/i.test(text)) return 'denied';
    return 'failed';
  }
  return 'succeeded';
}

function normalizeFinalResult(rec: Record<string, unknown>): ClaudeFinalResult {
  const usage = (rec.usage && typeof rec.usage === 'object' ? rec.usage : {}) as Record<string, unknown>;
  return {
    subtype: typeof rec.subtype === 'string' ? rec.subtype : '',
    isError: rec.is_error === true,
    text: typeof rec.result === 'string' ? rec.result : '',
    sessionId: typeof rec.session_id === 'string' ? rec.session_id : undefined,
    durationMs: typeof rec.duration_ms === 'number' ? rec.duration_ms : undefined,
    numTurns: typeof rec.num_turns === 'number' ? rec.num_turns : undefined,
    totalCostUsd: typeof rec.total_cost_usd === 'number' ? rec.total_cost_usd : undefined,
    inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
  };
}

/** Map tool-use observations to the capability that authorized them (may be undefined). */
export function capabilityOfToolUse(
  obs: Extract<StreamObservation, { kind: 'tool-use' }>,
): ReturnType<typeof inferCapabilityFromToolUse> {
  return inferCapabilityFromToolUse(obs.toolName, obs.input);
}

/** Used by tests to prove the parser never reads the permission config: parity is table-driven. */
export type { ClaudeCodePermissionConfig };
