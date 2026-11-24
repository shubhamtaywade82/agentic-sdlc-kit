// packages/core/src/workflows/state-root.ts
//
// Single resolver for where the kit's MACHINERY (run state, journal,
// execution/orchestration records) lives. Default is <projectRoot>/.ai-kit.
// Setting KIT_STATE_DIR relocates it to <KIT_STATE_DIR>/<name>-<hash>/ so a
// repository can stay free of kit runtime files.
//
// Deliberately NOT relocated: project.yml, specs and plans. They are
// project-rooted evidence, and Mode 1 reads them from a git worktree.

import { createHash } from 'node:crypto';
import path from 'node:path';

export const STATE_DIR_ENV = 'KIT_STATE_DIR';

/** Fail closed on a relative override: resolving it against cwd would scatter state. */
export function kitStateRoot(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env[STATE_DIR_ENV];
  if (override === undefined || override === '') return path.resolve(projectRoot, '.ai-kit');
  if (!path.isAbsolute(override)) {
    throw new Error(`${STATE_DIR_ENV} must be an absolute path (got '${override}')`);
  }
  const root = path.resolve(projectRoot);
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 8);
  return path.join(override, `${path.basename(root)}-${hash}`);
}
