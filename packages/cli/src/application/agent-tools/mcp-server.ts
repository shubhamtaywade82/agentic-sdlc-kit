// packages/cli/src/application/agent-tools/mcp-server.ts
//
// Serves the agent tool surface over the Model Context Protocol (item 4).
//
// Each tool's input schema is the strict contract schema, so the protocol layer
// refuses an unrecognized key before any handler runs. The handler then calls
// callAgentTool, which validates the same schema again, so the two layers agree.
// stdout carries the protocol only, so nothing here writes to it.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  KitNextInputSchema,
  KitPhaseInputSchema,
  KitStatusInputSchema,
} from '@agentic-sdlc-kit/contracts';
import { VERSION } from '../version.js';
import { callAgentTool, type AgentToolContext } from './dispatch.js';

const TOOLS = [
  {
    name: 'kit_next',
    description:
      'The next protocol action for a feature run: what to do, against which task, and feedback on the last rejected attempt when one applies.',
    inputSchema: KitNextInputSchema,
  },
  {
    name: 'kit_phase',
    description:
      "Run one TDD phase (red, green or refactor) for a task. The kit runs the plan's own verification command and records the verdict. It never accepts a command.",
    inputSchema: KitPhaseInputSchema,
  },
  {
    name: 'kit_status',
    description: 'The state of each task in a feature run: its phase and how many attempts it has had.',
    inputSchema: KitStatusInputSchema,
  },
] as const;

function textResult(text: string, isError: boolean) {
  return { content: [{ type: 'text' as const, text }], isError };
}

export function createAgentToolServer(ctx: AgentToolContext): McpServer {
  const server = new McpServer({ name: 'agentic-sdlc-kit', version: VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: unknown) => {
        const result = await callAgentTool(tool.name, args, ctx);
        return result.ok
          ? textResult(JSON.stringify(result.value, null, 2), false)
          : textResult(result.error, true);
      },
    );
  }
  return server;
}

/**
 * Serve the tools on stdio until the host closes the connection. The promise
 * resolves on close, not on connect: the CLI exits as soon as a command's
 * promise settles, which would end the session before any request arrives.
 */
export function serveAgentTools(ctx: AgentToolContext): Promise<void> {
  const server = createAgentToolServer(ctx);
  const transport = new StdioServerTransport();
  return new Promise<void>((resolve, reject) => {
    transport.onclose = () => resolve();
    transport.onerror = (err) => reject(err);
    server.connect(transport).catch(reject);
  });
}
