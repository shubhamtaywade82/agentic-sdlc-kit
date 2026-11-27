// packages/core/test-fixtures/signal-child.ts
//
// Child process for process-run-signal.test.ts. It starts one verification
// command that backgrounds a long sleep, records that sleep's pid, then waits
// to be signalled (default) or exits on its own (`exit` mode). Lives outside
// src/ so the build does not compile it.
import { runToSettlement } from '../src/verification/process-run.js';

const [pidFile, mode] = process.argv.slice(2);
if (pidFile === undefined) throw new Error('usage: signal-child <pid-file> [exit]');

void runToSettlement('sh', ['-c', `sleep 30 & echo $! > '${pidFile}'; wait`], process.cwd(), 60_000, 1024);

if (mode === 'exit') setTimeout(() => process.exit(0), 300);
