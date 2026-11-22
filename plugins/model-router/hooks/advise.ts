// plugins/model-router/hooks/advise.ts
//
// UserPromptSubmit command hook. Advisory only: it adds context and never
// blocks. Any failure exits 0 with no output, so a routing bug cannot stop
// the user's prompt.

import { pathToFileURL } from 'node:url';
import { adviseForPrompt } from '../policies/advise.js';

export function runAdvise(eventJson: string): { exitCode: number; stdout: string } {
  try {
    const event = JSON.parse(eventJson) as { prompt?: unknown };
    if (typeof event.prompt !== 'string') return { exitCode: 0, stdout: '' };
    const advice = adviseForPrompt(event.prompt);
    if (advice === null) return { exitCode: 0, stdout: '' };
    const body = { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: advice } };
    return { exitCode: 0, stdout: JSON.stringify(body) };
  } catch {
    return { exitCode: 0, stdout: '' };
  }
}

async function main(): Promise<void> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  const run = runAdvise(chunks.join(''));
  if (run.stdout) process.stdout.write(run.stdout);
  process.exitCode = run.exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
