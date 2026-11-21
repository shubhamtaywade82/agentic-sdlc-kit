// plugins/run-observer/policies/record.ts
//
// One JSON line per tool call, metadata only. Tool input and output are never
// written: they can contain credentials, and the telemetry must not become a
// second copy of them.

import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const LOG_RELATIVE_PATH = path.join('.ai-kit', 'state', 'run-observer', 'events.jsonl');
export const MAX_LOG_BYTES = 5 * 1024 * 1024;

export interface PostToolUseEvent {
  session_id?: unknown;
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_use_id?: unknown;
  cwd?: unknown;
}

const pick = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function buildRecord(event: PostToolUseEvent, now: Date): string {
  return JSON.stringify({
    ts: now.toISOString(),
    session_id: pick(event.session_id),
    hook_event_name: pick(event.hook_event_name),
    tool_name: pick(event.tool_name),
    tool_use_id: pick(event.tool_use_id),
  });
}

/** Append one line unless the log has reached its cap. Returns whether it wrote. */
export function appendRecord(logFile: string, line: string, maxBytes = MAX_LOG_BYTES): boolean {
  try {
    if (statSync(logFile).size >= maxBytes) return false;
  } catch {
    // No log yet: create it below.
  }
  mkdirSync(path.dirname(logFile), { recursive: true });
  appendFileSync(logFile, `${line}\n`, 'utf8');
  return true;
}
