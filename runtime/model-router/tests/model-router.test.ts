// claude plugin test — run with `claude plugin test` from this mod directory.
// The router must be invisible to tool execution (it only rewrites models on
// agent.spawn / turn.step). Deep routing coverage lives in runtime-tests/.

import { expect, test } from 'claude-code/testing';

test('never blocks tool calls (pass-through without a profile)', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }));
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' });
  expect(r.result).toBe('ok');
});

test('does not interfere with file writes', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }));
  const r = await $.tool.call({
    tool: 'Write',
    file_path: 'notes.md',
    content: 'hello\n',
  });
  expect(r.result).toBe('ok');
});
