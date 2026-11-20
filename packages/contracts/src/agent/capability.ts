// packages/contracts/src/agent/capability.ts
//
// M36 agent capability taxonomy (ADR-0020). Capabilities are the unit of
// least privilege granted to an agent execution: a provider may only
// exercise capabilities the orchestrator explicitly granted in
// AgentExecutionRequest.permissions.capabilities, and the tool broker
// authorizes each tool call against that set.
//
// Invariant (SECURITY.md §1, ADR-0020): an agent MUST NOT receive
// unrestricted authority merely because it is connected to Kit. The
// capability set is allowlisted; "execute arbitrary shell" is NOT a
// capability and never will be.

import { z } from 'zod';

export const AgentCapabilitySchema = z.enum([
  'repository.read',
  'repository.write',
  'git.read',
  'git.write',
  'process.test',
  'process.build',
  'process.lint',
  'process.typecheck',
  'network.access',
  'external.approval',
]);

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

/**
 * The full capability allowlist, derived from the schema so it cannot
 * drift. Tool-broker policy and runtime Mods both read from this set.
 */
export const AGENT_CAPABILITIES: readonly AgentCapability[] = AgentCapabilitySchema.options;
