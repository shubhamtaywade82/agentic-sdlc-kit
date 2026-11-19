// packages/core/src/planning/parser.ts
//
// Loads and parses ImplementationPlan from JSON or YAML files.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Errors, type Result } from '@agentic-sdlc-kit/contracts';
import { validatePlan, type PlanValidationResult } from './validator.js';

export async function loadPlan(targetPath: string): Promise<Result<PlanValidationResult>> {
  try {
    const stat = await fs.stat(targetPath);
    let filePath = targetPath;
    if (stat.isDirectory()) {
      filePath = path.join(targetPath, 'plan.json');
      const exists = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        filePath = path.join(targetPath, 'PLAN.md');
      }
    }

    const content = await fs.readFile(filePath, 'utf8');
    let candidate: unknown;
    if (filePath.endsWith('.json')) {
      candidate = JSON.parse(content);
    } else {
      // If markdown, check if JSON block is embedded or parse directly
      const jsonMatch = /```json\s*([\s\S]*?)\s*```/.exec(content);
      if (jsonMatch && jsonMatch[1]) {
        candidate = JSON.parse(jsonMatch[1]);
      } else {
        candidate = JSON.parse(content);
      }
    }

    return validatePlan(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: Errors.planInvalid(`Failed to load plan from ${targetPath}: ${msg}`),
    };
  }
}
