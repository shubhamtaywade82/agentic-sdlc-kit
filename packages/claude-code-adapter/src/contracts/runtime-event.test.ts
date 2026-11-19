// packages/claude-code-adapter/src/contracts/runtime-event.test.ts
import { describe, expect, it } from 'vitest';
import {
  isLifecycle,
  isModelRequest,
  isToolCall,
  isVerification,
  type RuntimeEvent,
} from './runtime-event.js';

const ts = '2026-01-01T00:00:00.000Z';

const lifecycle: RuntimeEvent = { kind: 'lifecycle', phase: 'session-start', timestamp: ts };
const toolCall: RuntimeEvent = { kind: 'tool-call', tool: 'Edit', input: {}, timestamp: ts };
const modelRequest: RuntimeEvent = {
  kind: 'model-request',
  model: 'claude-3-7-sonnet',
  effort: 'high',
  timestamp: ts,
};
const verification: RuntimeEvent = {
  kind: 'verification',
  report: {
    schemaVersion: 1,
    runId: 'RUN-001',
    status: 'passed',
    checks: [{ id: 'architecture', status: 'passed' }],
  },
  timestamp: ts,
};

describe('RuntimeEvent type guards', () => {
  it('narrows lifecycle', () => {
    expect(isLifecycle(lifecycle)).toBe(true);
    expect(isLifecycle(toolCall)).toBe(false);
  });
  it('narrows tool-call', () => {
    expect(isToolCall(toolCall)).toBe(true);
    expect(isToolCall(lifecycle)).toBe(false);
  });
  it('narrows model-request', () => {
    expect(isModelRequest(modelRequest)).toBe(true);
    expect(isModelRequest(toolCall)).toBe(false);
  });
  it('narrows verification', () => {
    expect(isVerification(verification)).toBe(true);
    expect(isVerification(lifecycle)).toBe(false);
  });
});

describe('RuntimeEvent discriminated union', () => {
  // Compile-time narrowing check.
  const summarize = (e: RuntimeEvent): string => {
    if (e.kind === 'lifecycle') return `lifecycle:${e.phase}`;
    if (e.kind === 'tool-call') return `tool:${e.tool}`;
    if (e.kind === 'model-request') return `model:${e.model}`;
    return `verification:${e.report.status}`;
  };
  it('narrows correctly', () => {
    expect(summarize(lifecycle)).toBe('lifecycle:session-start');
    expect(summarize(toolCall)).toBe('tool:Edit');
    expect(summarize(modelRequest)).toBe('model:claude-3-7-sonnet');
    expect(summarize(verification)).toBe('verification:passed');
  });
});
