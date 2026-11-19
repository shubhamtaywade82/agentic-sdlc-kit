// packages/contracts/src/common/identifier.ts
//
// Identifier format contract for FeatureId, TaskId, RunId, CheckId.
//
// Two accepted shapes:
//   1. Uppercase prefix + dash + 3+ digits: FEATURE-001, TASK-014, RUN-002
//   2. Lowercase kebab-case: unit-tests, typecheck, model-router
//
// See docs/contracts/CONTRACTS.md §1.2.

import { z } from 'zod';

export const IdentifierSchema = z.union([
  z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'must match FEATURE-NNN pattern'),
  z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'must be lowercase kebab-case, max 64 chars'),
]);

export type Identifier = z.infer<typeof IdentifierSchema>;

// M1: identifier kinds share the same runtime shape. We keep them as
// aliases so call sites can express intent without runtime overhead.
// Future milestones MAY tighten each kind with a stricter regex.
export type FeatureId = Identifier;
export type TaskId = Identifier;
export type RunId = Identifier;
export type CheckId = Identifier;

/**
 * Predicate form for use in non-zod contexts.
 */
export function isValidIdentifier(value: string): boolean {
  return IdentifierSchema.safeParse(value).success;
}
