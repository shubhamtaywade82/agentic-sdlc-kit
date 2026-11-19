// packages/core/src/specification/validator.ts
//
// Validates FeatureSpecification objects against schema and domain invariants:
// - Schema conformation via FeatureSpecificationSchema
// - Unique requirement and acceptance criteria identifiers
// - Explicit non-empty in-scope and out-of-scope boundaries
// - Unresolved high-risk open questions
// - Vague or missing acceptance criteria

import {
  Errors,
  FeatureSpecificationSchema,
  type FeatureSpecification,
  type Result,
} from '@agentic-sdlc-kit/contracts';

export interface SpecificationValidationIssue {
  readonly path: string;
  readonly message: string;
}

function checkDuplicateIds(spec: FeatureSpecification): SpecificationValidationIssue[] {
  const issues: SpecificationValidationIssue[] = [];
  const reqIds = new Set<string>();

  for (const r of [...spec.functionalRequirements, ...spec.nonFunctionalRequirements]) {
    if (reqIds.has(r.id)) {
      issues.push({ path: `requirements.${r.id}`, message: `Duplicate requirement ID: ${r.id}` });
    }
    reqIds.add(r.id);
  }

  const accIds = new Set<string>();
  for (const a of spec.acceptanceCriteria) {
    if (accIds.has(a.id)) {
      issues.push({
        path: `acceptanceCriteria.${a.id}`,
        message: `Duplicate acceptance criterion ID: ${a.id}`,
      });
    }
    accIds.add(a.id);
  }

  return issues;
}

function checkScopeBoundaries(spec: FeatureSpecification): SpecificationValidationIssue[] {
  const issues: SpecificationValidationIssue[] = [];
  if (spec.scope.in.length === 0) {
    issues.push({ path: 'scope.in', message: 'In-scope list must not be empty' });
  }
  if (spec.scope.out.length === 0) {
    issues.push({ path: 'scope.out', message: 'Out-of-scope list must not be empty' });
  }
  return issues;
}

function checkUnresolvedRisks(spec: FeatureSpecification): SpecificationValidationIssue[] {
  const issues: SpecificationValidationIssue[] = [];
  const hasHighRisk = spec.risks.some((r) => r.severity === 'high');
  const unresolvedQuestions = spec.openQuestions.filter((q) => !q.resolved);

  if (hasHighRisk && unresolvedQuestions.length > 0) {
    for (const q of unresolvedQuestions) {
      issues.push({
        path: `openQuestions.${q.id}`,
        message: `High risk present while open question '${q.id}' remains unresolved: ${q.question}`,
      });
    }
  }
  return issues;
}

function checkAcceptanceCriteriaQuality(
  spec: FeatureSpecification,
): SpecificationValidationIssue[] {
  const issues: SpecificationValidationIssue[] = [];
  if (spec.acceptanceCriteria.length === 0) {
    issues.push({
      path: 'acceptanceCriteria',
      message: 'Specification must define at least one acceptance criterion',
    });
    return issues;
  }
  for (const a of spec.acceptanceCriteria) {
    if (a.criterion.trim().length < 5) {
      issues.push({
        path: `acceptanceCriteria.${a.id}`,
        message: `Acceptance criterion '${a.id}' is too vague or short`,
      });
    }
  }
  return issues;
}

export function validateSpecification(candidate: unknown): Result<FeatureSpecification> {
  const parsed = FeatureSpecificationSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, error: Errors.specInvalid(`Schema validation failed: ${detail}`) };
  }

  const spec = parsed.data;
  const issues: SpecificationValidationIssue[] = [
    ...checkDuplicateIds(spec),
    ...checkScopeBoundaries(spec),
    ...checkUnresolvedRisks(spec),
    ...checkAcceptanceCriteriaQuality(spec),
  ];

  if (issues.length > 0) {
    const detail = issues.map((i) => `[${i.path}] ${i.message}`).join('; ');
    return { ok: false, error: Errors.specInvalid(`Specification checks failed: ${detail}`) };
  }

  return { ok: true, value: spec };
}
