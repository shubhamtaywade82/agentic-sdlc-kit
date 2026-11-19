// plugins/sdlc-guard/policies/shell-policy.ts
//
// Classifies a shell command into a ClassifiedAction. Returns null if the
// command does not match any destructive pattern.
//
// Per RESEARCH.md §5 rule 3: "Do not rely on regex as your security
// engine." This is a heuristic classifier for the common destructive
// patterns; the full Bash command parser is out of scope (the host's
// approval flow handles anything we classify as require-approval).

import type { ClassifiedAction } from '@agentic-sdlc-kit/contracts';

interface Pattern {
  regex: RegExp;
  category: ClassifiedAction['category'];
  impact: ClassifiedAction['impact'];
  // A function that extracts the scope from the match.
  scope?: (match: RegExpMatchArray) => { fileCount?: number; paths?: string[] };
}

const PATTERNS: ReadonlyArray<Pattern> = [
  // rm -rf / rm -fr / rm -rvf etc. (any flag combination with both r and f)
  {
    regex: /\brm\s+(-\S*r\S*f\S*|-\S*f\S*r\S*)/,
    category: 'file.delete',
    impact: 'local',
    scope: (m) => {
      const rest = m.input ?? '';
      // Count the path arguments after the flags.
      const tokens = rest
        .split(/\s+/)
        .slice(1)
        .filter((p) => !p.startsWith('-') && p.length > 0);
      return { fileCount: tokens.length, paths: tokens };
    },
  },
  // git push --force / -f
  {
    regex: /\bgit\s+push\b.*--force\b|\bgit\s+push\b.*\s-f\b/,
    category: 'git.force-push',
    impact: 'shared-branch',
  },
  // git rebase
  {
    regex: /\bgit\s+rebase\b/,
    category: 'git.rebase',
    impact: 'shared-branch',
  },
  // database migrations (rails db:migrate, prisma migrate, etc.)
  {
    regex: /\b(?:rails\s+db:migrate|prisma\s+migrate|knex\s+migrate|sequelize\s+migrate)\b/,
    category: 'db.migrate',
    impact: 'local',
  },
  // production database mutation (RAILS_ENV=production db:migrate or similar)
  {
    regex:
      /\b(?:RAILS_ENV=production|NODE_ENV=production)\b.*(?:db:migrate|db:drop|db:reset|db:seed)/,
    category: 'db.mutate-production',
    impact: 'production',
  },
  // npm publish / yarn publish
  {
    regex: /\b(?:npm|yarn|pnpm)\s+publish\b/,
    category: 'release.publish',
    impact: 'production',
  },
  // deploy commands
  {
    regex: /\b(?:deploy|kubectl\s+apply|helm\s+upgrade|terraform\s+apply)\b/,
    category: 'release.deploy',
    impact: 'production',
  },
];

export function classifyShellCommand(command: string): ClassifiedAction | null {
  for (const p of PATTERNS) {
    const m = command.match(p.regex);
    if (m) {
      const scope = p.scope ? p.scope(m) : {};
      return {
        category: p.category,
        impact: p.impact,
        scope: {
          fileCount: scope.fileCount,
          paths: scope.paths ?? [],
        },
      };
    }
  }
  return null;
}
