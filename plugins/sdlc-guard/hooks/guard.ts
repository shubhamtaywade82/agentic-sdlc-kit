// plugins/sdlc-guard/hooks/guard.ts
//
// PreToolUse hook for the Bash tool. Runs as a command hook: Claude Code
// writes the event JSON to stdin and reads the verdict from the exit code and
// stdout.
//   exit 0, no output              -> allow (the normal permission flow continues)
//   exit 0, hookSpecificOutput     -> ask (the host prompts the user)
//   exit 2, reason on stderr       -> deny (the reason is shown to Claude)
// Any other exit code is a NON-blocking error in Claude Code and would fail
// open. So every internal failure exits 2 here, and hooks.json also sets
// onFailure: "block" for timeouts and crashes.

import { pathToFileURL } from 'node:url';
import { decideBash } from '../policies/decision.js';

export interface HookRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const ALLOW: HookRun = { exitCode: 0, stdout: '', stderr: '' };

function deny(reason: string): HookRun {
  return { exitCode: 2, stdout: '', stderr: reason };
}

function ask(reason: string): HookRun {
  const body = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  };
  return { exitCode: 0, stdout: JSON.stringify(body), stderr: '' };
}

/** Pure entry: event JSON text in, hook verdict out. */
export function runGuard(eventJson: string): HookRun {
  let event: { tool_name?: unknown; tool_input?: { command?: unknown } };
  try {
    event = JSON.parse(eventJson) as typeof event;
  } catch {
    return deny('sdlc-guard: unreadable hook input (fail closed)');
  }
  if (event.tool_name !== 'Bash') return ALLOW;
  const command = event.tool_input?.command;
  if (typeof command !== 'string') {
    return deny('sdlc-guard: Bash event without a command string (fail closed)');
  }
  try {
    const decision = decideBash(command);
    if (decision.kind === 'deny') return deny(decision.reason);
    if (decision.kind === 'ask') return ask(decision.reason);
    return ALLOW;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return deny(`sdlc-guard: internal error, refusing (fail closed): ${message}`);
  }
}

async function main(): Promise<void> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  const run = runGuard(chunks.join(''));
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  process.exitCode = run.exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
