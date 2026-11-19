// packages/core/src/workflows/application/persistence.ts
//
// Persistence writer for the application workflow. Writes the full
// ApplicationPersistence shape (state + context + changeLog) to
// .ai-kit/state/application-workflow.json.
//
// This is a thin wrapper over core/artifacts/writer.ts that enforces:
//   - Writes only under .ai-kit/.
//   - Atomic write: the previous file is preserved until the new one is
//     written successfully.
//   - The changeLog is append-only: a new entry is added on every save.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Errors,
  type Result,
  type ApplicationPersistence,
  type ApplicationChangeLogEntry,
} from '@agentic-sdlc-kit/contracts';

const STATE_FILE = 'state/application-workflow.json';

export async function saveApplicationWorkflow(
  projectRoot: string,
  persistence: ApplicationPersistence,
  newEntry: ApplicationChangeLogEntry,
): Promise<Result<string>> {
  const target = path.resolve(projectRoot, '.ai-kit', STATE_FILE);
  const base = path.resolve(projectRoot, '.ai-kit');
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied('application workflow path escapes .ai-kit/', {
        target,
      }),
    };
  }
  const nextPersistence: ApplicationPersistence = {
    ...persistence,
    changeLog: [...persistence.changeLog, newEntry],
  };
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write to a temp file then rename for atomicity.
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(nextPersistence, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, target);
    return { ok: true, value: target };
  } catch (e) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied(`failed to save application workflow`, {
        cause: e instanceof Error ? e.message : String(e),
      }),
    };
  }
}

export async function loadApplicationWorkflow(
  projectRoot: string,
): Promise<Result<ApplicationPersistence>> {
  const target = path.resolve(projectRoot, '.ai-kit', STATE_FILE);
  try {
    const content = await fs.readFile(target, 'utf8');
    const data = JSON.parse(content) as ApplicationPersistence;
    return { ok: true, value: data };
  } catch (e) {
    return {
      ok: false,
      error: Errors.artifactReadDenied(`failed to load application workflow`, {
        cause: e instanceof Error ? e.message : String(e),
      }),
    };
  }
}
