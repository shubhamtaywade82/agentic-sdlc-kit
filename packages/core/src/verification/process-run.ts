// packages/core/src/verification/process-run.ts
//
// Runs one verification command to a single settled outcome. A run settles on
// the first of: the child closing its stdio, the child exiting (after the rest
// of its group is swept), or a timeout escalated to SIGKILL. A settled run
// leaves no member of the command's process group alive.

import { spawn, type ChildProcess } from 'node:child_process';
import { DETACH_GROUP, groupState, signalGroup } from './process-group.js';

const TERM_GRACE_MS = 2_000;
const SETTLE_GRACE_MS = 1_000;

/** Keeps at most `cap` bytes of one stream, exactly: a chunk is cut, never appended whole. */
export class ByteBudget {
  private readonly chunks: Buffer[] = [];
  private readonly cap: number;
  private used = 0;
  truncated = false;

  constructor(cap: number) {
    this.cap = cap;
  }

  push(chunk: Buffer): void {
    const room = this.cap - this.used;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    const kept = chunk.length <= room ? chunk : chunk.subarray(0, room);
    if (kept.length < chunk.length) this.truncated = true;
    this.chunks.push(kept);
    this.used += kept.length;
  }

  /** Decoded once, so a multi-byte character split across chunks survives intact. */
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

export type Termination = 'group-terminated' | 'termination-unconfirmed';

export interface RunOutcome {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** Set only for a timeout: whether the group was confirmed gone after the last signal. */
  readonly termination: Termination | null;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly spawnError?: string;
}

export function runToSettlement(
  file: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<RunOutcome> {
  return new Promise<RunOutcome>((resolve) => {
    new CommandRun(file, args, cwd, maxOutputBytes, resolve).start(timeoutMs);
  });
}

class CommandRun {
  private readonly child: ChildProcess;
  private readonly stdout: ByteBudget;
  private readonly stderr: ByteBudget;
  private readonly timers: Array<ReturnType<typeof setTimeout>> = [];
  private readonly started = Date.now();
  private readonly done: (outcome: RunOutcome) => void;
  private timedOut = false;
  private exitCode: number | null = null;
  private settled = false;

  constructor(
    file: string,
    args: readonly string[],
    cwd: string,
    maxOutputBytes: number,
    done: (outcome: RunOutcome) => void,
  ) {
    this.child = spawn(file, [...args], { cwd, shell: false, detached: DETACH_GROUP });
    this.stdout = new ByteBudget(maxOutputBytes);
    this.stderr = new ByteBudget(maxOutputBytes);
    this.done = done;
  }

  start(timeoutMs: number): void {
    this.child.stdout?.on('data', (d: Buffer) => this.stdout.push(d));
    this.child.stderr?.on('data', (d: Buffer) => this.stderr.push(d));
    this.child.on('error', (err) => this.settle(1, err.message));
    this.child.on('exit', (code) => this.onExit(code));
    this.child.on('close', (code) => this.settle(code ?? this.exitCode));
    this.later(() => this.escalate(), timeoutMs);
  }

  private onExit(code: number | null): void {
    this.exitCode = code;
    // The leader has exited, but a background member may still hold the pipes.
    this.sweepGroup();
    this.later(() => this.settle(this.exitCode), SETTLE_GRACE_MS);
  }

  private escalate(): void {
    this.timedOut = true;
    signalGroup(this.child, 'SIGTERM');
    this.later(() => {
      signalGroup(this.child, 'SIGKILL');
      this.later(() => this.settle(this.exitCode), SETTLE_GRACE_MS);
    }, TERM_GRACE_MS);
  }

  private sweepGroup(): void {
    if (groupState(this.child) === 'running') signalGroup(this.child, 'SIGKILL');
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private settle(code: number | null, spawnError?: string): void {
    if (this.settled) return;
    this.settled = true;
    for (const t of this.timers) clearTimeout(t);
    // Read the termination state before the final sweep: it is the state after our last signal.
    const termination = this.terminationState();
    this.sweepGroup();
    this.child.stdout?.destroy();
    this.child.stderr?.destroy();
    this.done({
      exitCode: code,
      stdout: this.stdout.text(),
      stderr: this.stderr.text(),
      timedOut: this.timedOut,
      termination,
      truncated: this.stdout.truncated || this.stderr.truncated,
      durationMs: Date.now() - this.started,
      ...(spawnError !== undefined ? { spawnError } : {}),
    });
  }

  private terminationState(): Termination | null {
    if (!this.timedOut) return null;
    return groupState(this.child) === 'gone' ? 'group-terminated' : 'termination-unconfirmed';
  }
}
