// packages/cli/src/commands/mcp.ts
//
// `kit mcp` serves the agent tool surface (kit_next, kit_phase, kit_status) over
// the Model Context Protocol on stdio, so a host can call the kit's typed tools
// instead of shelling out. Stdout carries the protocol only.

import path from 'node:path';
import { serveAgentTools } from '../application/agent-tools/mcp-server.js';
import type { Command, CommandContext, CommandResult } from './types.js';

export const mcpCommand: Command = {
  name: 'mcp',
  summary: 'Serve the agent tool surface over MCP on stdio (kit_next, kit_phase, kit_status).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(
        [
          'Usage: kit mcp',
          '',
          'Serve kit_next, kit_phase and kit_status over the Model Context Protocol on',
          'stdio. The working directory is the project. Stdout carries the protocol only.',
          '',
        ].join('\n'),
      );
      return { exitCode: 0 };
    }
    await serveAgentTools({ projectRoot: path.resolve(ctx.cwd) });
    return { exitCode: 0 };
  },
};
