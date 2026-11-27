// packages/cli/src/application/agent-tools/dispatch.test.ts
//
// The typed tool surface a host calls instead of shelling out (item 4). Every
// tool validates its input against a strict contract schema before it runs,
// returns a result rather than throwing, and never accepts a command: a phase
// runs the verification command the plan declares, nothing else.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES } from '@agentic-sdlc-kit/contracts';
import { callAgentTool } from './dispatch.js';

const dirs: string[] = [];

async function emptyProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-agent-tools-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

describe('agent tool surface', () => {
  it('exposes exactly the three protocol tools', () => {
    expect([...AGENT_TOOL_NAMES]).toEqual(['kit_next', 'kit_phase', 'kit_status']);
  });

  it('refuses an unknown tool name', async () => {
    const root = await emptyProject();
    const res = await callAgentTool('kit_shell', { command: 'rm -rf /' }, { projectRoot: root });
    expect(res.ok).toBe(false);
  });

  it('refuses a phase request that smuggles in a command', async () => {
    const root = await emptyProject();
    const res = await callAgentTool(
      'kit_phase',
      { featureId: 'FEATURE-001', taskId: 'TASK-001', phase: 'red', command: 'rm -rf /' },
      { projectRoot: root },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/command/);
  });

  it('refuses a phase outside red, green and refactor', async () => {
    const root = await emptyProject();
    const res = await callAgentTool(
      'kit_phase',
      { featureId: 'FEATURE-001', taskId: 'TASK-001', phase: 'completed' },
      { projectRoot: root },
    );
    expect(res.ok).toBe(false);
  });

  it('answers kit_next with the protocol action, and never throws on odd input', async () => {
    const root = await emptyProject();
    const next = await callAgentTool('kit_next', { featureId: 'FEATURE-001' }, { projectRoot: root });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value).toMatchObject({ requiredAction: 'feature.start' });

    for (const bad of [null, 'text', 42, []]) {
      const res = await callAgentTool('kit_next', bad, { projectRoot: root });
      expect(res.ok).toBe(false);
    }
  });

  it('reports a missing run as a failed result, not an exception', async () => {
    const root = await emptyProject();
    const status = await callAgentTool('kit_status', { featureId: 'FEATURE-404' }, { projectRoot: root });
    expect(status.ok).toBe(false);
    const phase = await callAgentTool(
      'kit_phase',
      { featureId: 'FEATURE-404', taskId: 'TASK-001', phase: 'red' },
      { projectRoot: root },
    );
    expect(phase.ok).toBe(false);
  });
});
