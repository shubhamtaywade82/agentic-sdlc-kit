import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentSpawn,
  fromLine,
  sessionStart,
  summarize,
  summarizeStats,
  toLine,
  toolCall,
  turnComplete,
  turnStart,
  turnStep,
} from '../run-observer/policies/events';
import type { RunRecord } from '../run-observer/policies/events';

// ---------------------------------------------------------------------------
// constructors + JSONL round-trip
// ---------------------------------------------------------------------------

test('constructors produce {ts, kind, fields} records', () => {
  const r = toolCall(1000, 'Bash', true, 42);
  assert.deepEqual(r, { ts: 1000, kind: 'tool-call', fields: { tool: 'Bash', ok: true, ms: 42 } });
  assert.deepEqual(sessionStart(1, 's1'), {
    ts: 1,
    kind: 'session-start',
    fields: { sessionId: 's1' },
  });
  assert.deepEqual(turnStart(2, 't1'), { ts: 2, kind: 'turn-start', fields: { turnId: 't1' } });
  assert.deepEqual(turnStep(3, 'claude-sonnet-4-5', 'agent-1', 10, 20), {
    ts: 3,
    kind: 'turn-step',
    fields: { model: 'claude-sonnet-4-5', agentId: 'agent-1', inputTokens: 10, outputTokens: 20 },
  });
  assert.deepEqual(turnComplete(4, 5000, 100, 200, false, undefined), {
    ts: 4,
    kind: 'turn-complete',
    fields: { durationMs: 5000, inputTokens: 100, outputTokens: 200, isAborted: false, agentId: undefined },
  });
  assert.deepEqual(agentSpawn(5, 'security-reviewer', 'claude-opus-4-6', true), {
    ts: 5,
    kind: 'agent-spawn',
    fields: { name: 'security-reviewer', model: 'claude-opus-4-6', isTeammate: true },
  });
});

test('toLine/fromLine round-trip through JSONL', () => {
  const records: RunRecord[] = [
    sessionStart(1, 's1'),
    toolCall(2, 'Read', true, 5),
    turnStart(3, 't1'),
    turnStep(4, 'claude-haiku-4-5', '', 50, 60),
    turnComplete(5, 8000, 110, 120, false, undefined),
    agentSpawn(6, 'code-linter', 'claude-haiku-4-5', false),
  ];
  const lines = records.map(toLine).join('\n');
  // undefined fields are dropped by JSON; compare through the same serialization
  const expected = records.map((r) => JSON.parse(JSON.stringify(r)) as RunRecord);
  const parsed = lines.split('\n').map(fromLine);
  assert.deepEqual(parsed, expected);
  // one JSON object per line
  for (const line of lines.split('\n')) {
    assert.ok(line.startsWith('{') && line.endsWith('}'));
  }
});

test('fromLine tolerates junk', () => {
  assert.equal(fromLine(''), null);
  assert.equal(fromLine('not json'), null);
  assert.equal(fromLine('{"ts":"x","kind":"tool-call","fields":{}}'), null); // ts must be a number
});

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

function sampleSession(): RunRecord[] {
  return [
    sessionStart(0, 's1'),
    toolCall(100, 'Read', true, 10),
    toolCall(200, 'Bash', true, 400),
    toolCall(300, 'Bash', false, 900), // failed, slowest
    toolCall(400, 'Edit', true, 250),
    turnStart(500, 't1'),
    turnStep(600, 'claude-sonnet-4-5', '', 1000, 200),
    turnStep(700, 'claude-sonnet-4-5', 'agent-7', 500, 50),
    turnComplete(800, 300, 1500, 250, false, undefined),
    turnStart(900, 't2'),
    turnStep(1000, 'claude-opus-4-6', '', 900, 100),
    turnComplete(1100, 100, 1000, 100, true, 'agent-7'),
    agentSpawn(1200, 'code-linter', 'claude-haiku-4-5', false),
    agentSpawn(1300, 'security-reviewer', 'claude-opus-4-6', true),
  ];
}

test('summarizeStats counts tools, turns, requests, models and spawns', () => {
  const s = summarizeStats(sampleSession());
  assert.equal(s.sessionMs, 1300); // last ts − first ts
  assert.equal(s.toolCalls, 4);
  assert.equal(s.failedToolCalls, 1);
  assert.equal(s.turns, 2);
  assert.equal(s.modelRequests, 3);
  assert.deepEqual(s.modelsSeen, ['claude-sonnet-4-5', 'claude-opus-4-6']);
  assert.equal(s.agentSpawns.length, 2);
  assert.deepEqual(s.agentSpawns[1], {
    name: 'security-reviewer',
    model: 'claude-opus-4-6',
    isTeammate: true,
  });
});

test('summarizeStats reports the slowest three tools, sorted', () => {
  const s = summarizeStats(sampleSession());
  assert.deepEqual(
    s.slowestTools.map((t) => t.tool),
    ['Bash', 'Bash', 'Edit'],
  );
  assert.deepEqual(
    s.slowestTools.map((t) => t.ms),
    [900, 400, 250],
  );
  assert.equal(s.slowestTools[0].ok, false);
});

test('summarizeStats takes tokens and abort flag from the LAST turn-complete', () => {
  const s = summarizeStats(sampleSession());
  assert.equal(s.inputTokens, 1000);
  assert.equal(s.outputTokens, 100);
  assert.equal(s.aborted, true);
});

test('summarizeStats handles empty and minimal sessions', () => {
  const empty = summarizeStats([]);
  assert.equal(empty.sessionMs, 0);
  assert.equal(empty.toolCalls, 0);
  assert.equal(empty.slowestTools.length, 0);
  assert.equal(empty.inputTokens, undefined);

  const minimal = summarizeStats([sessionStart(10, 's2'), turnComplete(20, 5, 7, 3, false, undefined)]);
  assert.equal(minimal.sessionMs, 10);
  assert.equal(minimal.turns, 0); // no turn-start records
  assert.equal(minimal.inputTokens, 7);
});

// ---------------------------------------------------------------------------
// summarize — the /kit:status text (string)
// ---------------------------------------------------------------------------

test('summarize renders the status text (counts, slowest, tokens)', () => {
  const text = summarize(sampleSession());
  assert.equal(typeof text, 'string');
  assert.match(text, /duration: 1s/);
  assert.match(text, /turns: 2/);
  assert.match(text, /model requests: 3/);
  assert.match(text, /tools: 4 calls \(1 failed\)/);
  assert.match(text, /Bash 900ms/);
  assert.match(text, /tokens \(last turn\): 1,000 in \/ 100 out/);
  assert.match(
    text,
    /agents spawned: code-linter \(claude-haiku-4-5\), security-reviewer \(claude-opus-4-6\) \[teammate\]/,
  );
  assert.match(text, /aborted/);

  const emptyText = summarize([]);
  assert.match(emptyText, /tools: 0 calls/);
  assert.ok(!emptyText.includes('agents spawned'));
  assert.ok(!emptyText.includes('tokens'));
});

test('summarize humanizes durations', () => {
  const text = summarize([
    sessionStart(0, 's'),
    toolCall(1, 'Bash', true, 75_000),
    toolCall(2, 'Read', true, 2_500),
    toolCall(3, 'Grep', true, 950),
  ]);
  assert.match(text, /duration: 3ms/);
  assert.match(text, /Bash 1m 15s/);
  assert.match(text, /Read 2s/);
  assert.match(text, /Grep 950ms/);
});
