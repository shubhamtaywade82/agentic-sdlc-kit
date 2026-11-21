// packages/cli/src/application/agent/providers/claude-code/permission-config.ts
//
// The GENERATED runtime policy representation for Claude Code (ADR-0020 §2).
//
// ADR-0020 §2: runtime enforcement consumes a representation GENERATED from
// the canonical ExecutionPolicy snapshot — never a hand-maintained second
// policy. This module is that generator for the claude-code provider: it
// derives Claude Code's session permission configuration (tool allowlist,
// denylist, permission mode, turn bound) from the same snapshot whose hash
// every event must echo.
//
// Parity (ADR-0020 §3) is pinned by permission-config.test.ts: a capability
// the snapshot did not grant produces NO allowing tool rule (and for network
// tools an explicit deny), and every Bash prefix rule maps back to exactly
// the capability that produced it (single mapping table, used for both
// derivation and event inference — parity by construction).
//
// Hard rules enforced here (ADR-0019 §6.5, ADR-0020 §6/§7):
//   - `bypassPermissions` is not representable: the mode type excludes it
//     and the argv builder asserts it is never passed.
//   - File-mutating tools are scoped to the granted writablePaths only.
//   - `networkAllowed: false` denies WebFetch/WebSearch even when the
//     `network.access` capability was granted (fail closed).
//   - The subagent tool (`Task`) is always denied: one execution is ONE
//     bounded agent, not an unbounded subagent tree.

import { AGENT_CAPABILITIES, type AgentCapability } from '@agentic-sdlc-kit/contracts';

/** Claude Code permission modes we are willing to generate. */
export type ClaudeCodePermissionMode = 'default' | 'acceptEdits' | 'plan';

/**
 * The generated representation of the canonical policy for one execution.
 * Purely derived: same snapshot in, same config out, no hidden state.
 */
export interface ClaudeCodePermissionConfig {
  /** Rules pre-approving exactly what the policy granted (Claude Code rule syntax). */
  readonly allowedTools: readonly string[];
  /** Tools explicitly denied regardless of the allowlist. */
  readonly disallowedTools: readonly string[];
  /** Never `bypassPermissions` (ADR-0019 §6.5). */
  readonly permissionMode: ClaudeCodePermissionMode;
  /** Turn bound derived from budget.maxToolCalls (defense in depth; the gateway enforces the real count). */
  readonly maxTurns: number | undefined;
}

/**
 * One Bash prefix rule. The SAME table drives both directions:
 *   - derivation: capability granted  -> `Bash(prefix:*)` rule emitted;
 *   - inference:  observed tool call  -> capability that authorized it.
 */
interface BashRule {
  /** Command prefix (compared against the start of the Bash command). */
  readonly prefix: string;
  /** Number of command tokens the rule matches (e.g. 3 for `npm run test`). */
  readonly matchTokens: number;
  readonly capability: AgentCapability;
}

const BASH_RULES: readonly BashRule[] = [
  // git.read
  { prefix: 'git log', matchTokens: 2, capability: 'git.read' },
  { prefix: 'git diff', matchTokens: 2, capability: 'git.read' },
  { prefix: 'git status', matchTokens: 2, capability: 'git.read' },
  { prefix: 'git show', matchTokens: 2, capability: 'git.read' },
  { prefix: 'git blame', matchTokens: 2, capability: 'git.read' },
  // git.write
  { prefix: 'git add', matchTokens: 2, capability: 'git.write' },
  { prefix: 'git commit', matchTokens: 2, capability: 'git.write' },
  { prefix: 'git checkout', matchTokens: 2, capability: 'git.write' },
  { prefix: 'git switch', matchTokens: 2, capability: 'git.write' },
  { prefix: 'git branch', matchTokens: 2, capability: 'git.write' },
  { prefix: 'git restore', matchTokens: 2, capability: 'git.write' },
  { prefix: 'git stash', matchTokens: 2, capability: 'git.write' },
  // process.test
  { prefix: 'npm test', matchTokens: 2, capability: 'process.test' },
  { prefix: 'npm run test', matchTokens: 3, capability: 'process.test' },
  { prefix: 'pnpm test', matchTokens: 2, capability: 'process.test' },
  { prefix: 'pnpm run test', matchTokens: 3, capability: 'process.test' },
  { prefix: 'pnpm vitest', matchTokens: 2, capability: 'process.test' },
  { prefix: 'npx vitest', matchTokens: 2, capability: 'process.test' },
  { prefix: 'vitest', matchTokens: 1, capability: 'process.test' },
  { prefix: 'node --test', matchTokens: 2, capability: 'process.test' },
  // process.build
  { prefix: 'npm run build', matchTokens: 3, capability: 'process.build' },
  { prefix: 'pnpm build', matchTokens: 2, capability: 'process.build' },
  { prefix: 'pnpm run build', matchTokens: 3, capability: 'process.build' },
  { prefix: 'npx tsc', matchTokens: 2, capability: 'process.build' },
  { prefix: 'tsc', matchTokens: 1, capability: 'process.build' },
  // process.lint
  { prefix: 'npm run lint', matchTokens: 3, capability: 'process.lint' },
  { prefix: 'pnpm lint', matchTokens: 2, capability: 'process.lint' },
  { prefix: 'pnpm run lint', matchTokens: 3, capability: 'process.lint' },
  { prefix: 'npx eslint', matchTokens: 2, capability: 'process.lint' },
  { prefix: 'eslint', matchTokens: 1, capability: 'process.lint' },
  // process.typecheck
  { prefix: 'npm run typecheck', matchTokens: 3, capability: 'process.typecheck' },
  { prefix: 'pnpm typecheck', matchTokens: 2, capability: 'process.typecheck' },
  { prefix: 'pnpm run typecheck', matchTokens: 3, capability: 'process.typecheck' },
  { prefix: 'tsc --noEmit', matchTokens: 2, capability: 'process.typecheck' },
];

/** Capabilities that map to non-Bash Claude Code tools. */
const READ_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob', 'LS'];
const WRITE_TOOLS: readonly string[] = ['Write', 'Edit', 'NotebookEdit'];
const NETWORK_TOOLS: readonly string[] = ['WebFetch', 'WebSearch'];

/** Always denied: subagents would multiply an execution beyond its bounds. */
const ALWAYS_DENIED: readonly string[] = ['Task'];

function has(list: readonly AgentCapability[], value: AgentCapability): boolean {
  return list.includes(value);
}

/**
 * Derive the Claude Code permission configuration from the canonical
 * snapshot fields (the same fields the gateway freezes into the request).
 *
 * NOTE: takes the REQUEST's permission fields, which the gateway has already
 * validated equal the canonical snapshot and whose policyHash the events
 * must echo — so this derivation is traceable to the exact policy that
 * authorized the execution.
 */
export function deriveClaudeCodePermissionConfig(
  permissions: {
    capabilities: readonly AgentCapability[];
    writablePaths: readonly string[];
    networkAllowed: boolean;
  },
  budget: { maxToolCalls: number },
): ClaudeCodePermissionConfig {
  const granted = permissions.capabilities;
  const allowed: string[] = [];
  const disallowed: string[] = [...ALWAYS_DENIED];

  // repository.read -> observation tools
  if (has(granted, 'repository.read')) allowed.push(...READ_TOOLS);

  // repository.write -> file mutation tools, SCOPED to writablePaths
  if (has(granted, 'repository.write')) {
    for (const tool of WRITE_TOOLS) {
      for (const target of permissions.writablePaths) {
        allowed.push(`${tool}(${target}/**)`);
      }
    }
  }

  // git.* / process.* -> Bash prefix rules from the single mapping table
  for (const rule of BASH_RULES) {
    if (has(granted, rule.capability)) allowed.push(`Bash(${rule.prefix}:*)`);
  }

  // network.access -> web tools; networkAllowed=false denies them (fail closed)
  if (has(granted, 'network.access')) {
    if (permissions.networkAllowed) allowed.push(...NETWORK_TOOLS);
    else disallowed.push(...NETWORK_TOOLS);
  } else {
    disallowed.push(...NETWORK_TOOLS);
  }

  // external.approval is not a tool: the approval POLICY governs it (the
  // provider blocks autonomously when it requires human approval).

  return {
    allowedTools: dedupe(allowed),
    disallowedTools: dedupe(disallowed),
    // 'default': headless sessions cannot prompt, so anything outside the
    // allowlist is denied by Claude Code itself — which is exactly the
    // fail-closed behavior the policy wants. Never bypassPermissions.
    permissionMode: 'default',
    maxTurns: budget.maxToolCalls > 0 ? budget.maxToolCalls : undefined,
  };
}

function dedupe(list: readonly string[]): string[] {
  return [...new Set(list)];
}

/**
 * Infer the capability an observed tool call exercises — the reverse
 * direction of the derivation, from the SAME mapping table. Used for
 * `tool.requested` events (observability only; an event never authorizes
 * anything).
 *
 * Unmapped tools return undefined: the provider skips the tool.requested
 * event rather than asserting a capability it cannot honestly name.
 */
export function inferCapabilityFromToolUse(
  toolName: string,
  input: unknown,
): AgentCapability | undefined {
  if (READ_TOOLS.includes(toolName)) return 'repository.read';
  if (WRITE_TOOLS.includes(toolName)) return 'repository.write';
  if (NETWORK_TOOLS.includes(toolName)) return 'network.access';
  if (toolName === 'Bash') return inferCapabilityFromBashCommand(bashCommandOf(input));
  return undefined;
}

function bashCommandOf(input: unknown): string {
  if (
    input &&
    typeof input === 'object' &&
    typeof (input as { command?: unknown }).command === 'string'
  ) {
    return (input as { command: string }).command;
  }
  return '';
}

/**
 * Match a Bash command against the rule table. Longer (more specific)
 * prefixes win, so `tsc --noEmit` resolves to process.typecheck, not the
 * 1-token `tsc` build rule.
 */
export function inferCapabilityFromBashCommand(command: string): AgentCapability | undefined {
  const trimmed = command.trim();
  let best: { rule: BashRule; score: number } | undefined;
  for (const rule of BASH_RULES) {
    if (trimmed.startsWith(rule.prefix)) {
      const score = rule.matchTokens * 100 - rule.prefix.length;
      if (!best || score > best.score) best = { rule, score };
    }
  }
  return best?.rule.capability;
}

/** Exported for parity tests: the full rule table for one capability. */
export function bashRulesForCapability(
  capability: AgentCapability,
): readonly { prefix: string; capability: AgentCapability }[] {
  return BASH_RULES.filter((r) => r.capability === capability);
}

/** Exported for parity tests: all capabilities with Bash rules. */
export const BASH_RULE_CAPABILITIES: readonly AgentCapability[] = [
  ...new Set(BASH_RULES.map((r) => r.capability)),
];

/** Capabilities the claude-code provider declares it can exercise. */
export const CLAUDE_CODE_SUPPORTED_CAPABILITIES: readonly AgentCapability[] = [
  ...AGENT_CAPABILITIES,
];
