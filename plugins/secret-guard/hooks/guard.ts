// plugins/secret-guard/hooks/guard.ts
//
// PreToolUse command hook. Refuses file writes whose new content contains a
// secret, and `git commit` when the staged diff adds one. Exit protocol:
//   exit 0, no output  -> allow
//   exit 2, stderr     -> deny (reason shown to Claude)
// Every internal failure exits 2: a non-2 non-zero code is non-blocking in
// Claude Code and would fail open. hooks.json also sets onFailure: "block".

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  addedLines,
  decideText,
  extractWriteText,
  isGitCommit,
  isWriteTool,
  type SecretDecision,
} from '../policies/decision.js';

export interface HookRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const ALLOW: HookRun = { exitCode: 0, stdout: '', stderr: '' };

function fromDecision(d: SecretDecision): HookRun {
  return d.kind === 'deny' ? { exitCode: 2, stdout: '', stderr: d.reason } : ALLOW;
}

function failClosed(reason: string): HookRun {
  return { exitCode: 2, stdout: '', stderr: `secret-guard: ${reason} (fail closed)` };
}

/** Staged diff of the project the hook runs in. Throws on git failure; the
 *  caller turns that into a refusal, never into an allow. */
export function readStagedDiff(cwd: string): string {
  return execFileSync('git', ['diff', '--cached', '--unified=0', '--no-color'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

interface HookEvent {
  tool_name?: unknown;
  tool_input?: Record<string, unknown>;
  cwd?: unknown;
}

/** Pure-ish entry: event JSON in, verdict out. `diffOf` is injectable for tests. */
export function runGuard(
  eventJson: string,
  diffOf: (cwd: string) => string = readStagedDiff,
): HookRun {
  let event: HookEvent;
  try {
    event = JSON.parse(eventJson) as HookEvent;
  } catch {
    return failClosed('unreadable hook input');
  }
  try {
    const input = event.tool_input ?? {};
    if (isWriteTool(event.tool_name)) {
      const text = extractWriteText(input);
      const filePath = typeof input.file_path === 'string' ? input.file_path : undefined;
      return text === undefined ? ALLOW : fromDecision(decideText(text, 'file-write', filePath));
    }
    if (event.tool_name === 'Bash' && typeof input.command === 'string' && isGitCommit(input.command)) {
      const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();
      return fromDecision(decideText(addedLines(diffOf(cwd)), 'git-commit'));
    }
    return ALLOW;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failClosed(`internal error: ${message}`);
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
