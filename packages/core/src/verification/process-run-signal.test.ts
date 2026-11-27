// packages/core/src/verification/process-run-signal.test.ts
//
// A verification command runs in its own process group, so the terminal's
// signals never reach it. The kit must forward them: a SIGINT to the kit, or
// the kit exiting, must not leave a background process running.
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHILD = path.join(PKG, 'test-fixtures', 'signal-child.ts');

const tmpDirs: string[] = [];
const pidsToReap: number[] = [];

afterEach(async () => {
  for (const pid of pidsToReap.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  for (const dir of tmpDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function pidFileIn(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kit-signal-'));
  tmpDirs.push(dir);
  return path.join(dir, 'pid');
}

async function waitForPid(pidFile: string): Promise<number> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const text = (await readFile(pidFile, 'utf8')).trim();
      if (/^\d+$/.test(text)) {
        const pid = Number(text);
        pidsToReap.push(pid);
        return pid;
      }
    } catch {
      // not written yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('background pid was never recorded');
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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

function startKit(pidFile: string, mode?: 'exit'): ChildProcess {
  const args = ['--import', 'tsx', CHILD, pidFile, ...(mode ? [mode] : [])];
  return spawn(process.execPath, args, { cwd: PKG, stdio: 'ignore' });
}

describe('verification command survives the kit only as long as the kit', () => {
  it('a SIGINT to the kit ends the verification command and its background process', async () => {
    const pidFile = await pidFileIn();
    const kit = startKit(pidFile);
    const pid = await waitForPid(pidFile);
    kit.kill('SIGINT');
    await once(kit, 'exit');
    expect(await waitGone(pid, 3_000)).toBe(true);
  }, 20_000);

  it('a kit that exits while a command is running leaves no background process', async () => {
    const pidFile = await pidFileIn();
    const kit = startKit(pidFile, 'exit');
    const pid = await waitForPid(pidFile);
    await once(kit, 'exit');
    expect(await waitGone(pid, 3_000)).toBe(true);
  }, 20_000);
});
