// packages/contracts/src/specification/specification.ts
//
// Feature specification contract. Declared in M0; produced by the
// requirements-engineering skill in M3 and validated by kit validate-spec.
//
// See docs/contracts/CONTRACTS.md §4.

import { z } from 'zod';

export const SpecificationSectionSchema = z.enum([
  'overview',
  'problem',
  'scope',
  'actors',
  'functionalRequirements',
  'nonFunctionalRequirements',
  'acceptanceCriteria',
  'edgeCases',
  'dependencies',
  'risks',
  'openQuestions',
]);

export const SeveritySchema = z.enum(['low', 'medium', 'high']);

export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  criterion: z.string().min(1),
});

export const RequirementSchema = z.object({
  id: z.string(),
  statement: z.string().min(1),
});

export const RiskSchema = z.object({
  id: z.string(),
  severity: SeveritySchema,
  description: z.string().min(1),
});

export const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  resolved: z.boolean(),
});

export const FeatureSpecificationSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-[0-9]{3,}$/, 'id must match FEATURE-NNN'),
    title: z.string().min(1).max(200),
    overview: z.string().min(1),
    problem: z.string().min(1),
    scope: z.object({
      in: z.array(z.string()),
      out: z.array(z.string()),
    }),
    actors: z.array(z.object({ name: z.string(), role: z.string() })),
    functionalRequirements: z.array(RequirementSchema),
    nonFunctionalRequirements: z.array(RequirementSchema),
    acceptanceCriteria: z.array(AcceptanceCriterionSchema),
    edgeCases: z.array(z.string()),
    dependencies: z.array(z.string()),
    risks: z.array(RiskSchema),
    openQuestions: z.array(OpenQuestionSchema),
  })
  .strict();

export type FeatureSpecification = z.infer<typeof FeatureSpecificationSchema>;

export const BddScenarioSchema = z.object({
  feature: z.string().min(1),
  scenario: z.string().min(1),
  given: z.array(z.string()),
  when: z.array(z.string()),
  then: z.array(z.string()),
});

export type BddScenario = z.infer<typeof BddScenarioSchema>;
