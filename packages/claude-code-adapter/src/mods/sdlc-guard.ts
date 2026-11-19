// packages/claude-code-adapter/src/mods/sdlc-guard.ts
//
// M10 SDLC Guard Mod: tool interception preventing unauthorized destructive actions:
// - Direct pushes to protected branches (main, master)
// - Destructive git operations (git push --force, git reset --hard, git clean -f)
// - Unauthorized package publish or external network modifications

export interface GuardEvaluation {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly requiresApproval?: boolean;
}

const DESTRUCTIVE_GIT_PATTERNS = [
  /git\s+push\s+.*--force/i,
  /git\s+push\s+.*-f(\s|$)/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-[a-zA-Z]*f/i,
  /git\s+branch\s+-D/i,
];

const PROTECTED_PUSH_PATTERNS = [
  /git\s+push\s+.*(origin\s+)?(main|master)(\s|$)/i,
  /git\s+push\s+.*refs\/heads\/(main|master)/i,
];

export class SdlcGuard {
  evaluateBashCommand(command: string): GuardEvaluation {
    const trimmed = command.trim();

    for (const pattern of DESTRUCTIVE_GIT_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: `Destructive git operation forbidden by policy: ${trimmed}`,
        };
      }
    }

    for (const pattern of PROTECTED_PUSH_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          requiresApproval: true,
          reason: `Push to protected branch requires explicit human approval: ${trimmed}`,
        };
      }
    }

    if (/\b(npm|pnpm|yarn)\s+publish\b/i.test(trimmed)) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Publishing packages requires explicit human approval',
      };
    }

    return { allowed: true };
  }
}
