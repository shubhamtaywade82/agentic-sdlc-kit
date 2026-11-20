// plugins/sdlc-guard/policies/types.ts
//
// Local type surface for the sdlc-guard plugin. VENDORED on purpose:
// a Claude Code plugin must be self-contained (official rule: a hooks
// module imports its own files by relative path and 'claude-code' —
// nothing else), so the plugin cannot import @agentic-sdlc-kit/contracts.
// These mirror the kit contracts (runtime-guard/action-classification,
// policy/policy) and must stay compatible with them.

export type ActionCategory =
  // File operations:
  | 'file.read'
  | 'file.create'
  | 'file.modify'
  | 'file.delete'
  | 'file.bulk-modify'
  | 'file.sensitive-modify' // config, env, secrets
  // Database:
  | 'db.read'
  | 'db.migrate'
  | 'db.mutate-dev'
  | 'db.mutate-production'
  // Git:
  | 'git.read'
  | 'git.commit'
  | 'git.push'
  | 'git.force-push'
  | 'git.rebase'
  // Dependency:
  | 'dependency.add'
  | 'dependency.remove'
  | 'dependency.upgrade'
  // Release / deploy:
  | 'release.tag'
  | 'release.publish'
  | 'release.deploy'
  // Network:
  | 'network.fetch'
  | 'network.mcp-call';

export type ActionImpact =
  | 'none' // read-only
  | 'local' // affects only the working copy
  | 'shared-branch' // affects other contributors
  | 'production'; // affects end users or production data

export interface ClassifiedAction {
  category: ActionCategory;
  impact: ActionImpact;
  // Structured scope: file paths, db names, etc. — never secret values.
  scope: {
    fileCount?: number;
    paths: string[];
    branch?: string;
    environment?: string;
  };
}

/** Context passed to the policy evaluator. */
export interface PolicyContext {
  interactive: boolean;
  scopeFileCount?: number;
  isProduction?: boolean;
}

export type PolicyVerdict = 'allow' | 'deny' | 'require-approval';

export interface PolicyEvaluation {
  verdict: PolicyVerdict;
  reason: string;
  approver?: 'user';
  matchedRuleId?: string;
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
  'dependency.remove',
  'release.tag',
  'release.publish',
  'release.deploy',
];

/** Heuristic: is this action destructive? */
export function isDestructive(action: ClassifiedAction): boolean {
  return DESTRUCTIVE_CATEGORIES.includes(action.category);
}
