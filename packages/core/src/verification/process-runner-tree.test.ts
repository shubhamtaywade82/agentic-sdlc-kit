// packages/core/src/verification/process-runner-tree.test.ts
//
// Process-tree and output-bound guarantees for the verification runner. A
// timeout must not leave grandchildren running, a finished command must not
// leave background work behind, and output must stay within its byte budget.
// POSIX process semantics (sh, sleep, /proc) are assumed; CI runs on Linux and macOS.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProcessVerificationRunner } from './process-runner.js';

const runner = new ProcessVerificationRunner();

/** True while the pid is running. A zombie has exited and does not count. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return /\)\s(\S)/.exec(stat)?.[1] !== 'Z';
  } catch {
    return true; // no /proc (macOS): a live pid that is not a zombie counts as running
  }
}

async function waitGone(pid: number, withinMs: number): Promise<boolean> {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isRunning(pid);
}

/** The first integer printed after the runner's "Timed out: " prefix, or the first in plain output. */
function pidFrom(output: string): number {
  const match = /(\d+)/.exec(output.replace(/^Timed out: /, ''));
  return Number(match?.[1] ?? NaN);
}

describe('ProcessVerificationRunner: process tree', () => {
  it('a timeout terminates the background grandchild as well as the shell', async () => {
    const started = Date.now();
    const res = await runner.runCommand(['sh', '-c', 'sleep 30 & echo $!; wait'], { timeoutMs: 200 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    const pid = pidFrom(res.value.output);
    expect(Number.isInteger(pid)).toBe(true);
    expect(await waitGone(pid, 2000)).toBe(true);
  });

  it('a command that ignores SIGTERM is killed and the run still settles', async () => {
    const started = Date.now();
    const res = await runner.runCommand(['sh', '-c', "trap '' TERM; sleep 30"], { timeoutMs: 200 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(6000);
  });

  it('a command that exits normally leaves no background process behind', async () => {
    const started = Date.now();
    const res = await runner.runCommand(['sh', '-c', 'sleep 30 & echo $!'], { timeoutMs: 5000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.timedOut).toBe(false);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(await waitGone(pidFrom(res.value.output), 2000)).toBe(true);
  });
});

describe('ProcessVerificationRunner: output bounds and decoding', () => {
  it('output stays within maxOutputBytes even when one chunk is far larger', async () => {
    const res = await runner.runCommand(
      ['node', '-e', "process.stdout.write('x'.repeat(5 * 1024 * 1024))"],
      { maxOutputBytes: 1024 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.truncated).toBe(true);
    expect(Buffer.byteLength(res.value.output, 'utf8')).toBeLessThanOrEqual(1024 + 64);
  });

  it('a multi-byte character split across chunks is decoded intact', async () => {
    const res = await runner.runCommand([
      'node',
      '-e',
      "process.stdout.write(Buffer.from([0xC3])); setTimeout(() => process.stdout.write(Buffer.from([0xA9])), 150)",
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.output).toContain('é');
    expect(res.value.output).not.toContain('�');
  });
});
