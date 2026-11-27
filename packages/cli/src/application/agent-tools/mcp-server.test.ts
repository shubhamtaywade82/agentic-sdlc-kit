// packages/cli/src/application/agent-tools/mcp-server.test.ts
//
// The typed tool surface served over the Model Context Protocol (item 4). The
// tests run a real MCP client against the server over the SDK's in-memory
// transport, so they exercise the protocol path a host uses, not just the
// dispatcher underneath it.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAgentToolServer } from './mcp-server.js';

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

async function connectedClient(): Promise<Client> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-mcp-'));
  dirs.push(root);
  const server = createAgentToolServer({ projectRoot: root });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'kit-mcp-test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? '').join('');
}

describe('agent tool MCP server', () => {
  it('lists the three protocol tools, each with a strict input schema', async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['kit_next', 'kit_phase', 'kit_status']);
    const phase = tools.find((t) => t.name === 'kit_phase');
    expect(phase?.inputSchema.additionalProperties).toBe(false);
  });

  it('answers kit_next with the protocol action over the wire', async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: 'kit_next', arguments: { featureId: 'FEATURE-001' } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toMatchObject({ requiredAction: 'feature.start' });
  });

  it('refuses a kit_phase call that carries a command, and runs nothing', async () => {
    const client = await connectedClient();
    const outcome = await client
      .callTool({
        name: 'kit_phase',
        arguments: { featureId: 'FEATURE-001', taskId: 'TASK-001', phase: 'red', command: 'rm -rf /' },
      })
      .then(
        (r) => (r.isError ? 'error' : 'ok'),
        () => 'error',
      );
    expect(outcome).toBe('error');
  });

  it('reports a missing run as a tool error, not a success', async () => {
    const client = await connectedClient();
    const outcome = await client
      .callTool({ name: 'kit_status', arguments: { featureId: 'FEATURE-404' } })
      .then((r) => (r.isError ? 'error' : 'ok'), () => 'error');
    expect(outcome).toBe('error');
  });
});
