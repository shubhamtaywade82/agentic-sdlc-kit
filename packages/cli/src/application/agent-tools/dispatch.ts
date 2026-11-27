// packages/cli/src/application/agent-tools/dispatch.ts
//
// Dispatches one typed agent tool call (item 4) to the core workflow APIs.
// Every call is validated against its contract schema first. Every outcome is
// a result, never an exception, so a host can act on any answer.

import {
  AGENT_TOOL_NAMES,
  KitNextInputSchema,
  KitPhaseInputSchema,
  KitStatusInputSchema,
  type AgentToolName,
} from '@agentic-sdlc-kit/contracts';
import {
  computeNextAction,
  getFeatureRunState,
  recordNextOffer,
  runTddPhase,
} from '@agentic-sdlc-kit/core';

export type AgentToolResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

export interface AgentToolContext {
  readonly projectRoot: string;
}

// The host calling a tool is an agent. The kit records it as such.
const ACTOR = { kind: 'agent' } as const;

function fail(error: string): AgentToolResult {
  return { ok: false, error };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function kitNext(input: unknown, ctx: AgentToolContext): Promise<AgentToolResult> {
  const parsed = KitNextInputSchema.safeParse(input);
  if (!parsed.success) return fail(`invalid input for kit_next: ${parsed.error.message}`);
  const res = await computeNextAction({ projectRoot: ctx.projectRoot, featureId: parsed.data.featureId });
  if (!res.ok) return fail(res.error.message);
  await recordNextOffer(ctx.projectRoot, res.value);
  return { ok: true, value: res.value };
}

async function kitPhase(input: unknown, ctx: AgentToolContext): Promise<AgentToolResult> {
  const parsed = KitPhaseInputSchema.safeParse(input);
  if (!parsed.success) return fail(`invalid input for kit_phase: ${parsed.error.message}`);
  const { featureId, taskId, phase } = parsed.data;
  const res = await runTddPhase({ featureId, projectRoot: ctx.projectRoot, taskId, phase, actor: ACTOR });
  if (!res.ok) return fail(res.error.message);
  return { ok: true, value: { featureId, taskId, phase, phaseNow: res.value.tasks[taskId]?.phase ?? null } };
}

async function kitStatus(input: unknown, ctx: AgentToolContext): Promise<AgentToolResult> {
  const parsed = KitStatusInputSchema.safeParse(input);
  if (!parsed.success) return fail(`invalid input for kit_status: ${parsed.error.message}`);
  const res = await getFeatureRunState(ctx.projectRoot, parsed.data.featureId);
  if (!res.ok) return fail(res.error.message);
  const tasks = Object.values(res.value.tasks).map((t) => ({
    taskId: t.taskId,
    phase: t.phase,
    attempts: t.records.length,
  }));
  return { ok: true, value: { featureId: parsed.data.featureId, tasks } };
}

export async function callAgentTool(
  name: unknown,
  input: unknown,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  try {
    if (typeof name !== 'string' || !(AGENT_TOOL_NAMES as readonly string[]).includes(name)) {
      return fail(`unknown tool '${String(name)}'`);
    }
    switch (name as AgentToolName) {
      case 'kit_next':
        return await kitNext(input, ctx);
      case 'kit_phase':
        return await kitPhase(input, ctx);
      case 'kit_status':
        return await kitStatus(input, ctx);
    }
  } catch (err) {
    return fail(messageOf(err));
  }
}
