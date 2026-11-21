// plugins/run-observer/hooks/record.ts
//
// PostToolUse command hook. Telemetry must never block the agent, so every
// path exits 0 and writes nothing to stdout. Failures are swallowed on purpose.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { appendRecord, buildRecord, LOG_RELATIVE_PATH, type PostToolUseEvent } from '../policies/record.js';

export function runRecord(eventJson: string, now: Date = new Date()): { exitCode: number } {
  try {
    const event = JSON.parse(eventJson) as PostToolUseEvent;
    const root = typeof event.cwd === 'string' ? event.cwd : process.cwd();
    appendRecord(path.join(root, LOG_RELATIVE_PATH), buildRecord(event, now));
  } catch {
    // Telemetry is best-effort by design.
  }
  return { exitCode: 0 };
}

async function main(): Promise<void> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  process.exitCode = runRecord(chunks.join('')).exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
