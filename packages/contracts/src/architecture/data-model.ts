// packages/contracts/src/architecture/data-model.ts
//
// Entity-relationship and data definitions (M8 Phase C — M8-14).

import { z } from 'zod';

export const DataTypeSchema = z.enum([
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'datetime',
  'date',
  'uuid',
  'json',
  'binary',
  'enum',
  'reference',
]);

export const FieldSchema = z.object({
  name: z.string().min(1),
  type: DataTypeSchema,
  required: z.boolean(),
  unique: z.boolean().default(false),
  indexed: z.boolean().default(false),
  // For type === "reference": the referenced entity ID.
  references: z.string().optional(),
  // For type === "enum": the allowed values.
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.unknown().optional(),
});

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  fields: z.array(FieldSchema).min(1),
  // Soft-delete, audit, multi-tenant, etc.
  conventions: z.array(z.string()).default([]),
});

export const RelationshipKindSchema = z.enum(['one-to-one', 'one-to-many', 'many-to-many']);

export const RelationshipSchema = z.object({
  id: z.string(),
  fromEntityId: z.string(),
  toEntityId: z.string(),
  kind: RelationshipKindSchema,
  // Whether the relationship is enforced at the DB level or in app code.
  enforcedAt: z.enum(['database', 'application']),
});

export const DataModelSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  entities: z.array(EntitySchema),
  relationships: z.array(RelationshipSchema),
});

export type DataType = z.infer<typeof DataTypeSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type RelationshipKind = z.infer<typeof RelationshipKindSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type DataModel = z.infer<typeof DataModelSchema>;
