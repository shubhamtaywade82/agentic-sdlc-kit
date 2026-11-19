// claude plugin test — run with `claude plugin test` from this mod directory.
// The observer must be invisible: tool calls pass through unharmed. The
// summarize/format logic is covered in runtime-tests/observer.spec.ts.

import { expect, test } from 'claude-code/testing';

test('observes tool calls without blocking them', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }));
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' });
  expect(r.result).toBe('ok');
});

test('keeps observing across many calls', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }));
  const first = await $.tool.call({ tool: 'Bash', command: 'echo one' });
  const second = await $.tool.call({ tool: 'Read', file_path: 'README.md' });
  expect(first.result).toBe('ok');
  expect(second.result).toBe('ok');
});
