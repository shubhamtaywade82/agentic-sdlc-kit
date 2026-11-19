// packages/core/src/planning/validator.ts
//
// Validates ImplementationPlan schema, dependency references, and DAG acyclicity.

import {
  Errors,
  ImplementationPlanSchema,
  type ImplementationPlan,
  type Result,
} from "@agentic-sdlc-kit/contracts";
import { topologicalSort, type DagAnalysis } from "./dag.js";

export interface PlanValidationResult {
  readonly plan: ImplementationPlan;
  readonly analysis: DagAnalysis;
}

function checkTaskReferences(plan: ImplementationPlan): string[] {
  const issues: string[] = [];
  const taskIds = new Set(plan.tasks.map((t) => t.id));

  if (taskIds.size !== plan.tasks.length) {
    issues.push("Plan contains duplicate task IDs");
  }

  for (const t of plan.tasks) {
    for (const dep of t.dependencies) {
      if (!taskIds.has(dep)) {
        issues.push(`Task ${t.id} references non-existent dependency '${dep}'`);
      }
    }
  }

  for (const edge of plan.edges) {
    if (!taskIds.has(edge.from)) {
      issues.push(`Edge references non-existent source task '${edge.from}'`);
    }
    if (!taskIds.has(edge.to)) {
      issues.push(`Edge references non-existent target task '${edge.to}'`);
    }
  }

  for (let i = 0; i < plan.verticalSlices.length; i++) {
    const slice = plan.verticalSlices[i]!;
    for (const taskId of slice) {
      if (!taskIds.has(taskId)) {
        issues.push(`Vertical slice ${i + 1} references non-existent task '${taskId}'`);
      }
    }
  }

  return issues;
}

export function validatePlan(candidate: unknown): Result<PlanValidationResult> {
  const parsed = ImplementationPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: Errors.planInvalid(`Schema validation failed: ${detail}`) };
  }

  const plan = parsed.data;
  const referenceIssues = checkTaskReferences(plan);
  if (referenceIssues.length > 0) {
    return { ok: false, error: Errors.planInvalid(referenceIssues.join("; ")) };
  }

  const dagResult = topologicalSort(plan.tasks, plan.edges);
  if (!dagResult.ok) {
    return dagResult;
  }

  return { ok: true, value: { plan, analysis: dagResult.value } };
}
