// packages/contracts/src/application/application-persistence.ts
//
// Application workflow persistence and recovery contract (M8 Phase G —
// M8-38 through M8-42).
//
// A developer must be able to close a session and continue the application
// workflow without regenerating the entire plan. The persisted shape is
// ApplicationState + ApplicationContext + a change log.

import { z } from 'zod';
import { ApplicationStateSchema } from './application-state.js';
import { ApplicationContextSchema } from './application-context.js';

export const APPLICATION_PERSISTENCE_SCHEMA_VERSION = 1 as const;

export const ApplicationPersistenceSchema = z.object({
  schemaVersion: z.literal(APPLICATION_PERSISTENCE_SCHEMA_VERSION),
  state: ApplicationStateSchema,
  context: ApplicationContextSchema,
  changeLog: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      kind: z.enum([
        'stage-entered',
        'stage-exited',
        'context-updated',
        'decision-raised',
        'decision-resolved',
        'scope-revised',
        'architecture-revised',
        'workflow-resumed',
        'workflow-blocked',
        'workflow-failed',
        'workflow-completed',
      ]),
      summary: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

export type ApplicationPersistence = z.infer<typeof ApplicationPersistenceSchema>;
export type ApplicationChangeLogEntry = ApplicationPersistence['changeLog'][number];
