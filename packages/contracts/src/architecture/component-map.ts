// packages/contracts/src/architecture/component-map.ts
//
// Component and module map (M8 Phase C — M8-13).

import { z } from 'zod';

export const ComponentKindSchema = z.enum([
  'frontend',
  'backend',
  'service',
  'data-store',
  'external-integration',
  'background-job',
  'shared-library',
]);

export const ComponentSchema = z.object({
  id: z.string(),
  kind: ComponentKindSchema,
  name: z.string().min(1),
  responsibility: z.string().min(1),
  dependsOn: z.array(z.string()),
  // Files / modules where this component lives. Filled in during scaffolding.
  filePaths: z.array(z.string()).default([]),
});

export const ComponentMapSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  components: z.array(ComponentSchema),
});

export type ComponentKind = z.infer<typeof ComponentKindSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ComponentMap = z.infer<typeof ComponentMapSchema>;
