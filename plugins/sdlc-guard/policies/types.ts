// plugins/sdlc-guard/policies/types.ts
//
// Local type surface for the sdlc-guard Mod. Self-contained on purpose: a
// Claude Code hooks module imports only its own files by relative path and
// 'claude-code', so it cannot import @agentic-sdlc-kit/contracts.

export type ActionCategory =
  // File operations:
  | 'file.delete'
  | 'file.bulk-modify'
  | 'file.sensitive-modify'
  // Database:
  | 'db.migrate'
  | 'db.mutate-dev'
  | 'db.mutate-production'
  // Git:
  | 'git.force-push'
  | 'git.rebase'
  | 'git.destructive'
  // Shell:
  | 'shell.remote-exec'
  | 'shell.unparsed'
  // Release / deploy:
  | 'release.publish'
  | 'release.deploy';

export type ActionImpact = 'local' | 'shared-branch' | 'production';

export interface ClassifiedAction {
  category: ActionCategory;
  impact: ActionImpact;
  scope: { paths: string[] };
}

export interface PolicyContext {
  interactive: boolean;
  scopeFileCount?: number;
  isProduction?: boolean;
}

export type PolicyVerdict = 'allow' | 'deny' | 'require-approval';

export interface PolicyEvaluation {
  verdict: PolicyVerdict;
  reason: string;
}

const DESTRUCTIVE_CATEGORIES: ReadonlyArray<ActionCategory> = [
  'file.delete',
  'file.bulk-modify',
  'file.sensitive-modify',
  'db.migrate',
  'db.mutate-dev',
  'db.mutate-production',
  'git.force-push',
  'git.rebase',
  'git.destructive',
  'shell.remote-exec',
  'shell.unparsed',
  'release.publish',
  'release.deploy',
];

export function isDestructive(action: ClassifiedAction): boolean {
  return DESTRUCTIVE_CATEGORIES.includes(action.category);
}
