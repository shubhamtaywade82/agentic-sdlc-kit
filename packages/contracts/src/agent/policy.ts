// packages/contracts/src/agent/policy.ts
//
// M36 canonical execution policy snapshot (ADR-0020 §1). There is exactly
// ONE policy definition in the kit, and it lives here: a normalized,
// versioned snapshot of everything a policy grants and bounds — the
// permission grant (capabilities + writable paths + network), the
// execution budget, and the approval policy. Every agent execution
// receives one; its stable hash (`policyHash`) is carried by the
// AgentExecutionRequest and echoed in every AgentExecutionEvent, so each
// decision and artifact is traceable to the exact policy in force when
// it was produced.
//
// The snapshot COMPOSES the request's policy fields rather than
// duplicating them: `permissions`, `budget`, and `approvalPolicy` are the
// same contract objects the request embeds. A snapshot is what the
// gateway freezes per execution; the request's inline fields are that
// frozen snapshot rendered into the provider-neutral request.
//
// Two enforcement points derive from this one definition (ADR-0020 §2):
// the gateway (provider-neutral) and the runtime representation (host
// specific, PR4). Parity between them is a release blocker.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AgentCapabilitySchema } from './capability.js';
import { AgentApprovalPolicySchema, ExecutionBudgetSchema } from './execution.js';

export const AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * The canonical policy snapshot. Field-for-field this is the policy part
 * of an AgentExecutionRequest; the gateway hashes THIS object (not the
 * request) so the hash is independent of non-policy request fields.
 */
export const AgentPolicySnapshotSchema = z.object({
  schemaVersion: z.literal(AGENT_POLICY_SNAPSHOT_SCHEMA_VERSION),
  permissions: z.object({
    capabilities: z.array(AgentCapabilitySchema).min(1),
    writablePaths: z.array(z.string().min(1)),
    networkAllowed: z.boolean(),
  }),
  budget: ExecutionBudgetSchema,
  approvalPolicy: AgentApprovalPolicySchema,
});
export type AgentPolicySnapshot = z.infer<typeof AgentPolicySnapshotSchema>;

/**
 * Canonical JSON: object keys sorted recursively, no insignificant
 * whitespace. Sorting makes the serialization — and therefore the hash —
 * independent of property insertion order, so two snapshots that differ
 * only in key order are the SAME policy, as they must be.
 */
export function canonicalPolicyJson(snapshot: AgentPolicySnapshot): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        sorted[key] = canonicalize(record[key]);
      }
      return sorted;
    }
    return value;
  };
  return JSON.stringify(canonicalize(snapshot));
}

/**
 * Stable hash of a policy snapshot: `sha256:<hex>` of the canonical JSON.
 * This is the value carried by AgentExecutionRequest.policyHash and
 * echoed in every event; the gateway rejects any event whose echo does
 * not match the snapshot frozen for that execution (fail closed,
 * ADR-0020 §4).
 *
 * Implemented with node:crypto — the kit is a Node-only toolchain
 * (engines.node >= 18) and every consumer (CLI, gateway, mods) runs on
 * Node.
 */
export function computePolicyHash(snapshot: AgentPolicySnapshot): string {
  return `sha256:${createHash('sha256').update(canonicalPolicyJson(snapshot), 'utf8').digest('hex')}`;
}
