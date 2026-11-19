// packages/core/src/scaffolding/generator.ts
//
// Scaffold generator. Takes a ScaffoldRequest + a TemplateManifest,
// validates the variables, plans the file operations (using the safe
// writer), and — if execute=true — writes the files.
//
// INVARIANTS (post-M7 §2.3 Phase D):
//   - Show planned operations BEFORE executing (caller may inspect the plan
//     and decide not to execute).
//   - Never overwrite existing files silently.
//   - Preserve user configuration.
//   - Validate template variables.
//   - Record generated files in the result.
//   - Support safe recovery from interrupted generation (the result carries
//     interrupted=true if any write fails midway).

import {
  type Result,
  type ScaffoldPlan,
  type ScaffoldRequest,
  type ScaffoldResult,
  type TemplateManifest,
} from '@agentic-sdlc-kit/contracts';
import { executeWrite, planWrite, type WriteOutcome } from './safe-writer.js';

/**
 * Validate the variables in a request against the manifest's variable
 * declarations. Returns a list of validation errors (empty if valid).
 */
export function validateVariables(
  manifest: TemplateManifest,
  variables: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const v of manifest.variables) {
    if (v.required) {
      const value = variables[v.name];
      if (value === undefined || value === '') {
        errors.push(`variable ${v.name} is required`);
        continue;
      }
    }
    if (v.pattern) {
      const value = variables[v.name];
      if (value !== undefined) {
        let re: RegExp;
        try {
          re = new RegExp(v.pattern);
        } catch {
          errors.push(`variable ${v.name} has an invalid pattern in manifest: ${v.pattern}`);
          continue;
        }
        if (!re.test(value)) {
          errors.push(`variable ${v.name} value does not match pattern ${v.pattern}`);
        }
      }
    }
  }
  return errors;
}

/**
 * Plan a scaffold: validate variables and produce a list of planned file
 * operations WITHOUT writing anything.
 */
export async function planScaffold(
  request: ScaffoldRequest,
  manifest: TemplateManifest,
): Promise<Result<ScaffoldPlan>> {
  const validationErrors = validateVariables(manifest, request.variables);
  // Even if there are validation errors, we produce the plan so the caller
  // can see what would have happened; they decide whether to proceed.
  const plannedOperations = [];
  for (const f of manifest.files) {
    const plan = await planWrite(request.targetDir, f.path, f.preserve);
    if (!plan.ok) return plan;
    plannedOperations.push(plan.value);
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      request,
      template: manifest,
      plannedOperations,
      validationErrors,
    },
  };
}

/**
 * Execute a scaffold plan. Writes each file in plannedOperations using
// the provided content provider. If any write fails, the result is
// marked interrupted=true and execution stops.
 */
export async function executeScaffold(
  plan: ScaffoldPlan,
  contentProvider: (path: string) => string,
): Promise<Result<ScaffoldResult>> {
  const executed: WriteOutcome[] = [];
  const ownedFiles: string[] = [];
  let interrupted = false;
  for (const op of plan.plannedOperations) {
    if (op.kind === 'skip-existing') {
      executed.push({ path: op.path, kind: 'skip-existing', reason: op.reason });
      continue;
    }
    const content = contentProvider(op.path);
    const r = await executeWrite(plan.request.targetDir, op, content);
    if (!r.ok) {
      interrupted = true;
      return {
        ok: true,
        value: {
          schemaVersion: 1,
          plan,
          executedOperations: executed,
          ownedFiles,
          interrupted,
        },
      };
    }
    executed.push(r.value);
    if (r.value.kind === 'create' || r.value.kind === 'overwrite-approved') {
      ownedFiles.push(op.path);
    }
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      plan,
      executedOperations: executed,
      ownedFiles,
      interrupted,
    },
  };
}
