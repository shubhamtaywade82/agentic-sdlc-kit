// packages/contracts/src/architecture/security-design.ts
//
// Security architecture contract (M8 Phase C — M8-16).

import { z } from 'zod';

export const AuthMethodSchema = z.enum([
  'session',
  'jwt',
  'oauth2',
  'api-key',
  'service-account',
  'none',
]);

export const SecurityDesignSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string(),
  authentication: z.object({
    method: AuthMethodSchema,
    rationale: z.string().min(1),
    // Where credentials are stored (never in code).
    credentialStore: z.string().min(1),
  }),
  authorization: z.object({
    model: z.enum(['rbac', 'abac', 'acl', 'none']),
    roles: z.array(z.string()),
    protectedResources: z.array(z.string()),
  }),
  // Threats identified during design and their mitigations.
  threats: z.array(
    z.object({
      id: z.string(),
      threat: z.string().min(1),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      mitigation: z.string().min(1),
    }),
  ),
  // Secrets handling: how the app loads credentials at runtime.
  secrets: z.object({
    loader: z.enum(['env', 'vault', 'file']),
    rotationPolicy: z.string().min(1),
  }),
});

export type AuthMethod = z.infer<typeof AuthMethodSchema>;
export type SecurityDesign = z.infer<typeof SecurityDesignSchema>;
