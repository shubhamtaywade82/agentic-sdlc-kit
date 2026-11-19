// packages/contracts/src/architecture/architecture-options.ts
//
// Architecture options contract (M8 Phase C — M8-12).
//
// The kit proposes alternative architecture options; the developer picks
// one. The choice is recorded as an ADR. The kit MUST NOT default to
// microservices or distributed infrastructure; every option must be
// justified by actual requirements.

import { z } from 'zod';

export const ArchitectureOptionKindSchema = z.enum([
  'modular-monolith',
  'microservices',
  'modular-monolith-with-bounded-contexts',
  'serverless',
  'other',
]);

export const ArchitectureOptionSchema = z.object({
  id: z.string(),
  kind: ArchitectureOptionKindSchema,
  name: z.string().min(1),
  rationale: z.string().min(1),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  // Requirements that justify this option (must trace to a real requirement).
  justifiedBy: z.array(z.string()),
  rejected: z.boolean().default(false),
  rejectionReason: z.string().optional(),
});

export const ArchitectureOptionsSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  options: z.array(ArchitectureOptionSchema).min(2, 'at least two options required'),
  selectedOptionId: z.string(),
});

export type ArchitectureOptionKind = z.infer<typeof ArchitectureOptionKindSchema>;
export type ArchitectureOption = z.infer<typeof ArchitectureOptionSchema>;
export type ArchitectureOptions = z.infer<typeof ArchitectureOptionsSchema>;
