// packages/core/src/scaffolding/safe-writer.ts
//
// Safe file writer for the scaffolder. Enforces:
//   - Never overwrite existing files silently (returns skip-existing).
//   - Preserve files marked preserve:true in the manifest.
//   - Reject path escapes (../ in target paths).
//   - Record every file written so the installer (M15) knows what the
//     scaffold owns.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Errors,
  type Result,
  type FileOperationKind,
  type PlannedFileOperation,
} from '@agentic-sdlc-kit/contracts';

export interface WriteOutcome {
  path: string;
  kind: FileOperationKind;
  bytesWritten?: number;
  reason?: string;
}

/**
 * Resolve a target file path inside targetDir. Rejects path escapes.
 */
export function resolveTargetPath(targetDir: string, relativePath: string): Result<string> {
  const cleaned = relativePath.replace(/^\.?\/+/, '');
  if (cleaned.includes('..')) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied("relative path contains '..'", { relativePath }),
    };
  }
  const base = path.resolve(targetDir);
  const target = path.resolve(base, cleaned);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied('resolved path escapes targetDir', { target }),
    };
  }
  return { ok: true, value: target };
}

/**
 * Plan a single file write. If the file exists and preserve is true,
// returns skip-existing. If it exists and preserve is false, returns
// overwrite-approved (the caller must have explicit approval to overwrite).
 */
export async function planWrite(
  targetDir: string,
  relPath: string,
  preserve: boolean,
): Promise<Result<PlannedFileOperation>> {
  const target = resolveTargetPath(targetDir, relPath);
  if (!target.ok) return target;
  try {
    await fs.access(target.value);
    // File exists.
    if (preserve) {
      return {
        ok: true,
        value: { path: relPath, kind: 'skip-existing', reason: 'preserve=true' },
      };
    }
    return {
      ok: true,
      value: { path: relPath, kind: 'overwrite-approved', reason: 'exists; preserve=false' },
    };
  } catch {
    return { ok: true, value: { path: relPath, kind: 'create' } };
  }
}

/**
 * Execute a single file write. The kind must be `create` or
// `overwrite-approved`; `skip-existing` is a no-op.
 */
export async function executeWrite(
  targetDir: string,
  op: PlannedFileOperation,
  content: string,
): Promise<Result<WriteOutcome>> {
  if (op.kind === 'skip-existing') {
    return { ok: true, value: { path: op.path, kind: 'skip-existing', reason: op.reason } };
  }
  const target = resolveTargetPath(targetDir, op.path);
  if (!target.ok) return target;
  try {
    await fs.mkdir(path.dirname(target.value), { recursive: true });
    await fs.writeFile(target.value, content, 'utf8');
    return {
      ok: true,
      value: { path: op.path, kind: op.kind, bytesWritten: Buffer.byteLength(content, 'utf8') },
    };
  } catch (e) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied(`failed to write ${op.path}`, {
        cause: e instanceof Error ? e.message : String(e),
      }),
    };
  }
}
