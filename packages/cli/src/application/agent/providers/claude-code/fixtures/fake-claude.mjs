// packages/cli/src/application/agent/providers/claude-code/fixtures/fake-claude.mjs
//
// Fake Claude Code CLI for provider tests — drives the REAL provider code
// path (spawn, stream parsing, event emission, settlement) without needing
// the real binary or network. Behavior is selected with FAKE_CLAUDE_MODE:
//
//   happy      — full success stream (text + Write tool_use + tool_result + result)
//   maxturns   — result subtype error_max_turns
//   error      — result is_error with an API error text
//   denied     — result is_error with a permission-denial text
//   sleep      — hangs until killed (cancel/timeout paths)
//   crash      — exits 137 with a partial stream (no result object)
//   signal     — kills itself with SIGKILL mid-stream
//   noresult   — exits 0 without a result object
//   resume     — happy stream (the test asserts the --resume argv)
//   flood      — emits far more than the output bound (used with a tiny cap)
//
// The fixture writes its received argv (and cwd) to FAKE_CLAUDE_ARGV_FILE
// so tests can assert the derived headless invocation without trusting
// stdout formats.

import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE ?? 'happy';

if (argv.includes('--version')) {
  process.stdout.write('2.1.7 (Claude Code)\n');
  process.exit(0);
}

if (process.env.FAKE_CLAUDE_ARGV_FILE) {
  writeFileSync(
    process.env.FAKE_CLAUDE_ARGV_FILE,
    JSON.stringify({ argv, cwd: process.cwd(), mode }),
  );
}

const sid = process.env.FAKE_CLAUDE_SESSION_ID ?? 'sess-fake-001';
const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

if (mode === 'sleep') {
  emit({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd() });
  // Hang until the provider kills us; flush the init line first.
  const timer = setInterval(() => {}, 60_000);
  process.on('SIGTERM', () => {
    clearInterval(timer);
    process.exit(0);
  });
} else if (mode === 'crash') {
  emit({ type: 'system', subtype: 'init', session_id: sid });
  process.exit(137);
} else if (mode === 'signal') {
  emit({ type: 'system', subtype: 'init', session_id: sid });
  process.kill(process.pid, 'SIGKILL');
} else if (mode === 'noresult') {
  emit({ type: 'system', subtype: 'init', session_id: sid });
  process.exit(0);
} else if (mode === 'flood') {
  const filler = 'x'.repeat(1024);
  for (let i = 0; i < 512; i += 1) {
    emit({ type: 'assistant', message: { content: [{ type: 'text', text: filler }] } });
  }
  process.exit(0);
} else {
  emit({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd(), tools: [] });
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'Working on it.' }] } });
  emit({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'marker.txt', content: 'x' } }],
    },
  });
  emit({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok', is_error: false }] },
  });
  const result =
    mode === 'maxturns'
      ? {
          type: 'result',
          subtype: 'error_max_turns',
          is_error: true,
          duration_ms: 5,
          num_turns: 99,
          result: 'Max turns reached',
          session_id: sid,
          usage: { input_tokens: 3, output_tokens: 4 },
        }
      : mode === 'error'
        ? {
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            duration_ms: 7,
            num_turns: 1,
            result: 'API Error: 500',
            session_id: sid,
            usage: { input_tokens: 1, output_tokens: 1 },
          }
        : mode === 'denied'
          ? {
              type: 'result',
              subtype: 'error_during_execution',
              is_error: true,
              duration_ms: 9,
              num_turns: 1,
              result: 'permission denied: Bash is not allowed',
              session_id: sid,
              usage: { input_tokens: 2, output_tokens: 2 },
            }
          : {
              type: 'result',
              subtype: 'success',
              is_error: false,
              duration_ms: 12,
              num_turns: 2,
              result: 'Done: created the marker file.',
              session_id: sid,
              total_cost_usd: 0.003,
              usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            };
  emit(result);
  process.exit(0);
}
