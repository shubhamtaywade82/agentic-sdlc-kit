// plugins/sdlc-guard/policies/git-policy.ts
//
// Classifies git commands into ClassifiedAction values. Separate from
// shell-policy.ts because git has its own command structure.

import type { ClassifiedAction } from './types';

export function classifyGitCommand(command: string): ClassifiedAction | null {
  // git push --force
  if (/\bgit\s+push\b.*--force\b/.test(command) || /\bgit\s+push\b.*\s-f\b/.test(command)) {
    return {
      category: 'git.force-push',
      impact: 'shared-branch',
      scope: { paths: [] },
    };
  }
  // git rebase
  if (/\bgit\s+rebase\b/.test(command)) {
    return {
      category: 'git.rebase',
      impact: 'shared-branch',
      scope: { paths: [] },
    };
  }
  // git commit (allowed by default; the secret-guard Mod inspects content)
  return null;
}
