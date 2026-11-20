// packages/core/src/workflows/tdd-run-store.ts
//
// Persistence for phase-driven feature runs (ADR-0018).
//
// The run state is the handoff boundary between workflow invocations:
// the agent writes tests and implementations between `kit feature`
// phase calls, so the evidence chain must survive process exits.
//
// State lives at .ai-kit/state/feature-runs/<featureId>.json and is
// written atomically (tmp file + rename), like all kit state.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Errors, type Result } from '@agentic-sdlc-kit/contracts';
import type { TddStepRecord } from '../tdd/cycle.js';

/**
 * v2 (ADR-0018 P1): step records carry task-targeted verification
 * metadata (command + failure classification). v1 files load lazily —
 * their records simply lack `verification` and are treated as
 * unclassified by the Red evidence gate (fail closed, no rewrite).
 */
export const FEATURE_RUN_SCHEMA_VERSION = 2 as const;

/** Schema versions this build can read; new saves always write the latest. */
const READABLE_SCHEMA_VERSIONS: readonly number[] = [1, FEATURE_RUN_SCHEMA_VERSION];

/** TDD phase of a single planned task within a feature run. */
export type TaskTddPhase = 'red' | 'green' | 'refactor' | 'completed';

export interface TaskRunState {
  readonly taskId: string;
  phase: TaskTddPhase;
  records: TddStepRecord[];
}

export interface FeatureRunState {
  readonly schemaVersion: typeof FEATURE_RUN_SCHEMA_VERSION;
  readonly featureId: string;
  readonly createdAt: string;
  updatedAt: string;
  tasks: Record<string, TaskRunState>;
}

const RUN_DIR = 'state/feature-runs';

/** Feature ids become file names: keep them to safe identifier characters. */
const FEATURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateFeatureId(featureId: string): Result<true> {
  if (!FEATURE_ID_PATTERN.test(featureId)) {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `Invalid feature id '${featureId}': expected letters, digits, '.', '_' or '-'`,
      ),
    };
  }
  return { ok: true, value: true };
}

export function featureRunPath(projectRoot: string, featureId: string): string {
  return path.resolve(projectRoot, '.ai-kit', RUN_DIR, `${featureId}.json`);
}

export async function saveFeatureRunState(
  projectRoot: string,
  state: FeatureRunState,
): Promise<void> {
  const target = featureRunPath(projectRoot, state.featureId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  // A v1 file loaded lazily and re-saved after a new phase attempt is
  // written in the current (v2) format; pre-existing v1 records are kept
  // verbatim and remain subject to the fail-closed Red gate.
  const normalized: FeatureRunState = { ...state, schemaVersion: FEATURE_RUN_SCHEMA_VERSION };
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, target);
}

export async function loadFeatureRunState(
  projectRoot: string,
  featureId: string,
): Promise<Result<FeatureRunState>> {
  const target = featureRunPath(projectRoot, featureId);
  try {
    const raw = JSON.parse(await fs.readFile(target, 'utf8')) as FeatureRunState;
    if (
      !READABLE_SCHEMA_VERSIONS.includes(raw.schemaVersion) ||
      typeof raw.tasks !== 'object' ||
      raw.tasks === null
    ) {
      return {
        ok: false,
        error: Errors.contractInvalid(`Corrupted feature run state at ${target}`),
      };
    }
    return { ok: true, value: raw };
  } catch {
    return {
      ok: false,
      error: Errors.contractInvalid(
        `No feature run state found for ${featureId} at ${target} — ` +
          `start one with \`kit feature ${featureId} start\``,
      ),
    };
  }
}
