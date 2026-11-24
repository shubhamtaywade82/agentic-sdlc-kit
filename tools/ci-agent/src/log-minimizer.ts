// tools/ci-agent/src/log-minimizer.ts
//
// CI log minimization: strip ANSI control sequences, keep only the error
// frames (windows around failure lines), and map the file paths the
// compiler/test runner printed back to repository files. Keeps the
// autofix prompt inside a sane budget instead of shipping whole logs.

// eslint-disable-next-line no-control-regex -- the escape sequence IS the subject of this rule
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const FAILURE_LINE =
  /(?:\berror\b|\bfail(?:ed|ure|ures)?\b|\bAssertionError\b|\bTypeError\b|\bRangeError\b|\bSyntaxError\b|\bExpected\b|\bReceived\b|\bCannot find\b|\bnot found\b|\btimeout\b|\b✗\b|\b✘\b)/i;

// Repository-shaped paths as printed by vitest/tsc/eslint:
// "packages/cli/src/commands/skills.ts:12:34", "plugins/…", "./src/…".
const PATH_PATTERN =
  /(?:^|[\s'"`(=,:])(\.{0,2}\/)?((?:packages|plugins|tools|scripts|docs|fixtures|\.github)\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+)(?::\d+(?::\d+)?)?/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Windows of `contextLines` around each failure line, deduplicated and
 * capped at `maxFrames` frames. Returns the frames as text blocks.
 */
export function extractErrorFrames(
  log: string,
  maxFrames: number,
  contextLines: number,
): readonly string[] {
  const lines = stripAnsi(log).split('\n');
  const chosen = new Set<number>();
  let frames = 0;
  for (let i = 0; i < lines.length && frames < maxFrames; i++) {
    const line = lines[i] ?? '';
    if (FAILURE_LINE.test(line)) {
      frames++;
      for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
        chosen.add(j);
      }
    }
  }
  const blocks: string[] = [];
  let run: string[] = [];
  let previous = -2;
  for (const index of [...chosen].sort((a, b) => a - b)) {
    if (index !== previous + 1 && run.length > 0) {
      blocks.push(run.join('\n'));
      run = [];
    }
    run.push(`${index + 1}: ${lines[index] ?? ''}`);
    previous = index;
  }
  if (run.length > 0) blocks.push(run.join('\n'));
  return blocks;
}

/** Unique repository file paths referenced in the log (capped). */
export function mapFilePaths(log: string, max: number): readonly string[] {
  const found = new Set<string>();
  const text = stripAnsi(log);
  for (const match of text.matchAll(PATH_PATTERN)) {
    const path = match[2];
    if (path !== undefined) found.add(path);
    if (found.size >= max) break;
  }
  return [...found].sort();
}

/** The minimized job log the autofix agent sees (truncation is always marked). */
export function minimizeJobLog(log: string, maxChars: number): string {
  const frames = extractErrorFrames(log, 12, 2);
  const raw = frames.length > 0 ? frames.join('\n…\n') : stripAnsi(log);
  return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n…(log truncated)` : raw;
}
