// packages/core/src/verification/process-group.ts
//
// Signals a verification command's whole process group. POSIX only: Windows
// has no process groups, so there the runner signals the direct child and
// reports the termination as unconfirmed rather than claiming a tree kill.

import type { ChildProcess } from 'node:child_process';

const IS_POSIX = process.platform !== 'win32';

/** Spawn the command as its own group leader, so the whole group can be signalled. */
export const DETACH_GROUP = IS_POSIX;

export type GroupState = 'running' | 'gone' | 'unknown';

export function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (IS_POSIX) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    // ESRCH: nothing is left to signal, which is the outcome we want.
  }
}

/** Whether any member of the group still answers signal 0. */
export function groupState(child: ChildProcess): GroupState {
  if (!IS_POSIX || child.pid === undefined) return 'unknown';
  try {
    process.kill(-child.pid, 0);
    return 'running';
  } catch (err) {
    // EPERM means a group exists that we may not probe, so it is not gone.
    return isErrorCode(err, 'EPERM') ? 'running' : 'gone';
  }
}

function isErrorCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

// Groups are detached from the terminal, so the terminal's signals never reach
// them. The kit forwards them instead: a command that is still running when the
// kit is interrupted or exits is ended with the kit.
const GRACE_MS = 1_000;
const liveGroups = new Set<ChildProcess>();
let forwarding = false;

/** Track a command's group from spawn until it settles. */
export function trackGroup(child: ChildProcess): void {
  liveGroups.add(child);
  if (IS_POSIX) installForwarding();
}

export function untrackGroup(child: ChildProcess): void {
  liveGroups.delete(child);
}

function signalTracked(signal: NodeJS.Signals): void {
  for (const child of liveGroups) signalGroup(child, signal);
}

function installForwarding(): void {
  if (forwarding) return;
  forwarding = true;
  process.on('exit', () => signalTracked('SIGKILL'));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const onSignal = (): void => {
      signalTracked('SIGTERM');
      setTimeout(() => {
        signalTracked('SIGKILL');
        // Nothing else handles this signal, so end the kit with it, as the default would.
        if (process.listenerCount(signal) <= 1) {
          process.removeListener(signal, onSignal);
          process.kill(process.pid, signal);
        }
      }, GRACE_MS);
    };
    process.on(signal, onSignal);
  }
}
