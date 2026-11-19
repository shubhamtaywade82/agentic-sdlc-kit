// packages/contracts/src/learning/engineering-lesson.ts
//
// M30 engineering lesson (RESEARCH.md §9). A lesson is a verified claim
// derived from repeated episodes. It must include evidence, scope,
// confidence, and counterexamples.
//
// INVARIANT (RESEARCH.md §9): "An AI's explanation of a failure is not
// necessarily the actual root cause." Lessons must include evidence and
// are classified by confidence level.

import { z } from 'zod';

export const LESSON_SCHEMA_VERSION = 1 as const;

export const LessonClassificationSchema = z.enum([
  'verified', // multiple independent evidence sources; high confidence
  'probable', // some evidence; medium confidence
  'hypothesis', // proposed; not yet validated
  'rejected', // invalidated by counterexamples
]);

export const EngineeringLessonSchema = z.object({
  schemaVersion: z.literal(LESSON_SCHEMA_VERSION),
  id: z.string(),
  title: z.string().min(1),
  // The claim this lesson makes.
  claim: z.string().min(1),
  // The scope where this lesson applies.
  scope: z.object({
    project: z.string().optional(),
    stacks: z.array(z.string()).default([]),
    workflows: z.array(z.string()).default([]),
  }),
  // Evidence supporting the claim (episode ids + evidence references).
  evidence: z.array(
    z.object({
      episodeId: z.string(),
      evidenceRef: z.string().min(1),
    }),
  ),
  // Confidence (0.0 to 1.0); supported by evidence count and independence.
  confidence: z.number().min(0).max(1),
  // The classification (verified / probable / hypothesis / rejected).
  classification: LessonClassificationSchema,
  // Where this lesson applies.
  applicability: z.array(z.string()).default([]),
  // Episodes that contradict the claim (must be tracked honestly).
  counterexamples: z.array(z.string()).default([]),
  createdAt: z.string(),
  lastValidatedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

export type LessonClassification = z.infer<typeof LessonClassificationSchema>;
export type EngineeringLesson = z.infer<typeof EngineeringLessonSchema>;
