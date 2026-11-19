// packages/contracts/src/architecture/api-contract.ts
//
// API design contract (M8 Phase C — M8-15).
//
// The kit uses a minimal, OpenAPI-flavored contract rather than a full
// OpenAPI 3.1 document. This keeps the contract reviewable and lets a
// later stage emit a full OpenAPI document if needed.

import { z } from 'zod';

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const ParameterLocationSchema = z.enum(['path', 'query', 'header', 'body']);

export const ParameterSchema = z.object({
  name: z.string().min(1),
  location: ParameterLocationSchema,
  type: z.string().min(1),
  required: z.boolean(),
  description: z.string().min(1),
});

export const ResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  description: z.string().min(1),
  // Reference to a DataModel entity or a free-form shape name.
  bodyRef: z.string().optional(),
});

export const EndpointSchema = z.object({
  id: z.string(),
  method: HttpMethodSchema,
  path: z.string().min(1).startsWith('/'),
  operationId: z.string().min(1),
  summary: z.string().min(1),
  parameters: z.array(ParameterSchema).default([]),
  responses: z.array(ResponseSchema).min(1),
  // Authentication required?
  requiresAuth: z.boolean().default(true),
  // Required role(s) if any.
  requiredRoles: z.array(z.string()).default([]),
});

export const ApiContractSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  baseUrl: z.string().optional(),
  endpoints: z.array(EndpointSchema),
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type ParameterLocation = z.infer<typeof ParameterLocationSchema>;
export type Parameter = z.infer<typeof ParameterSchema>;
export type Response = z.infer<typeof ResponseSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type ApiContract = z.infer<typeof ApiContractSchema>;
