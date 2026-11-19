/**
 * sdlc-guard — destructive shell-command governance (pure policy, no $ usage).
 *
 * `assessCommand` splits a command line into shell statements (`;`, `&&`, `||`,
 * newlines), evaluates the rule list against each statement (first match wins,
 * most specific first), and combines: deny > ask > allow.
 *
 * Deny rules (hard block):
 *   git force push (--force, -f, +refspec — NOT --force-with-lease)
 *   git filter-branch
 *   git reflog expire --expire=now
 *   rm -r targeting /, ~, absolute paths or cwd-wide globs
 *   curl/wget piped into sh/bash/zsh/dash
 *   DROP TABLE|DATABASE / TRUNCATE TABLE inside a db console command
 *   chmod -R 777
 *
 * Ask rules (modal approval, default answer Refuse):
 *   git push (any), git reset --hard, git branch -D, git push --delete,
 *   migration commands (unless approvals.migrations: not-required),
 *   deployment commands (unless approvals.deployment: not-required),
 *   sudo
 */

export interface ShellPolicyConfig {
  approvals: {
    migrations: 'required' | 'not-required';
    deployment: 'required' | 'not-required';
  };
}

export type ShellAction = 'allow' | 'ask' | 'deny';

export interface ShellVerdict {
  action: ShellAction;
  rule: string;
  reason: string;
  /** Set for allow verdicts that were downgraded by config — the hook logs it. */
  note?: string;
}

export function assessCommand(command: string, cfg: ShellPolicyConfig): ShellVerdict {
  const statements = splitStatements(command);
  let ask: ShellVerdict | null = null;
  let note: string | null = null;
  for (const stmt of statements) {
    const v = assessStatement(stmt, cfg);
    if (v.action === 'deny') return v;
    if (v.action === 'ask' && ask === null) ask = v;
    if (v.note !== undefined && note === null) note = v.note;
  }
  if (ask !== null) return ask;
  if (note !== null) return { action: 'allow', rule: 'default', reason: '', note };
  return { action: 'allow', rule: 'default', reason: '' };
}

/** Split on statement separators. Single `|` is kept — pipes belong to one statement. */
export function splitStatements(command: string): string[] {
  return command
    .split(/&&|\|\||;|\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// ---------------------------------------------------------------------------
// Statement tokenization helpers
// ---------------------------------------------------------------------------

function wordsOf(stmt: string): string[] {
  return stmt.split(/\s+/).filter((w) => w !== '');
}

/** Index of the first word that is not an env assignment / wrapper (sudo, nice, env). */
function commandStart(words: string[]): number {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w === 'sudo' || w === 'nice' || w === 'env' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/** The git subcommand of a statement ("git -C repo push ..." → "push"), or null. */
function gitSubcommand(words: string[]): string | null {
  const start = commandStart(words);
  if (words[start] !== 'git') return null;
  let i = start + 1;
  while (i < words.length) {
    const w = words[i];
    if (w === '-C' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') {
      i += 2; // these global flags take a value
      continue;
    }
    if (w.startsWith('-')) {
      i++;
      continue;
    }
    return w;
  }
  return null;
}

function isGitSubcommand(words: string[], sub: string): boolean {
  return gitSubcommand(words) === sub;
}

// ---------------------------------------------------------------------------
// Deny rules
// ---------------------------------------------------------------------------

/** --force / -f / short-flag clusters containing f / +refspec — NOT --force-with-lease. */
function hasForcePushFlag(stmt: string, words: string[]): boolean {
  // `--force` or `--force=true|1` as its own word; must not match --force-with-lease*
  if (/(^|\s)--force(=(true|1))?(?![\w-])/.test(stmt)) return true;
  // short-flag cluster containing f: -f, -fq, -uf, -fR ...
  if (/(^|\s)-[A-Za-z]*f[A-Za-z]*(?![\w-])/.test(stmt)) return true;
  // force refspec: `git push origin +main:main` / `git push origin +main`
  for (let i = 1; i < words.length; i++) {
    if (words[i].length > 1 && words[i].startsWith('+')) return true;
  }
  return false;
}

interface RmInvocation {
  recursive: boolean;
  targets: string[];
}

function parseRm(words: string[]): RmInvocation | null {
  const start = commandStart(words);
  if (words[start] !== 'rm') return null;
  const targets: string[] = [];
  let recursive = false;
  let i = start + 1;
  while (i < words.length) {
    const w = words[i];
    if (w === '--') {
      for (let j = i + 1; j < words.length; j++) targets.push(words[j]);
      break;
    }
    if (w === '-r' || w === '-R' || w === '--recursive') recursive = true;
    else if (w === '-f' || w === '--force') {
      /* force alone does not make rm dangerous; tracked for completeness */
    } else if (/^-[A-Za-z]+$/.test(w)) {
      if (/[rR]/.test(w)) recursive = true;
    } else if (w.startsWith('--')) {
      /* other long flags (-i, -v, --interactive, ...) — ignore */
    } else {
      targets.push(w);
    }
    i++;
  }
  return { recursive, targets };
}

/**
 * Catastrophic targets are denied regardless of flags. Absolute paths and
 * anything under ~ are denied for recursive rm (the policy is a pure function
 * and cannot know the repo root, so it fails closed: use relative paths).
 */
function isCatastrophicRmTarget(t: string): boolean {
  return t === '/' || t === '~' || t === '.' || t === '*' || t === './*' || t === '~/*';
}

function isDangerousRmTarget(raw: string): boolean {
  const unquoted = raw.replace(/^['"]/, '').replace(/['"]$/, '');
  if (isCatastrophicRmTarget(unquoted)) return true;
  let s = unquoted.replace(/\/+$/, ''); // ignore trailing slashes
  if (s === '') s = '/'; // the target was all slashes
  if (s.startsWith('~')) return true; // home directory
  if (s.startsWith('/')) return true; // absolute path — fail closed
  return false;
}

function isPipeToShell(stmt: string): boolean {
  if (!/\b(curl|wget)\b/.test(stmt)) return false;
  const parts = stmt.split('|'); // statements were already split on `||`
  for (let i = 1; i < parts.length; i++) {
    const words = wordsOf(parts[i]);
    let j = 0;
    while (
      j < words.length &&
      (words[j] === 'sudo' || words[j] === 'env' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[j]))
    ) {
      j++;
    }
    if (j < words.length && /^(ba|z|da)?sh$/.test(words[j])) return true;
  }
  return false;
}

const SQL_DESTRUCTIVE_RE = /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i;

/** psql/mysql/mariadb/sqlite3/rails dbconsole (incl. piped input and docker exec). */
function isDbConsole(stmt: string): boolean {
  const words = wordsOf(stmt);
  const start = commandStart(words);
  const first = words[start] ?? '';
  if (first === 'psql' || first === 'mysql' || first === 'mariadb' || first === 'sqlite3') {
    return true;
  }
  if (first === 'rails' && words.slice(start + 1).includes('dbconsole')) return true;
  if (
    first === 'docker' &&
    words.includes('exec') &&
    words.some((w) => w === 'psql' || w === 'mysql' || w === 'mariadb')
  ) {
    return true;
  }
  const parts = stmt.split('|');
  for (let i = 1; i < parts.length; i++) {
    const head = wordsOf(parts[i])[0] ?? '';
    if (head === 'psql' || head === 'mysql' || head === 'mariadb' || head === 'sqlite3') {
      return true;
    }
  }
  return false;
}

function isChmodRecursive777(words: string[]): boolean {
  const start = commandStart(words);
  if (words[start] !== 'chmod') return false;
  let recursive = false;
  let mode777 = false;
  for (let i = start + 1; i < words.length; i++) {
    const w = words[i];
    if (w === '-R' || w === '--recursive') recursive = true;
    else if (/^-[A-Za-z]+$/.test(w) && /[Rr]/.test(w)) recursive = true;
    if (w === '777' || w === '0777') mode777 = true;
  }
  return recursive && mode777;
}

// ---------------------------------------------------------------------------
// Ask rules
// ---------------------------------------------------------------------------

function isMigrationCommand(stmt: string): boolean {
  if (/\b(rake|rails)\s+db:(migrate|rollback|drop|reset|seed|redo|setup|prepare)(:[a-z]+)?\b/.test(stmt)) {
    return true;
  }
  if (/\bmanage\.py\s+(migrate|flush)\b/.test(stmt)) return true; // python/python3/./manage.py
  if (/\bprisma\s+migrate\b/.test(stmt)) return true; // npx prisma migrate ...
  if (/\bknex\s+migrate\b/.test(stmt)) return true; // npx knex migrate:latest ...
  if (/\bflyway\s+(migrate|clean|repair|undo|validate|baseline)\b/.test(stmt)) return true;
  if (/\bliquibase\s+(update|rollback|drop|tag|changelog-sync)\b/.test(stmt)) return true;
  return false;
}

function isDeploymentCommand(stmt: string): boolean {
  return (
    /\bcap(\s+\S+)?\s+deploy\b/.test(stmt) || // capistrano: cap deploy / cap production deploy
    /\bkamal\s+deploy\b/.test(stmt) ||
    /\bvercel\s+deploy\b/.test(stmt) ||
    /\bvercel\b[^\n]*\s--prod\b/.test(stmt) ||
    /\bnetlify\s+deploy\b/.test(stmt) ||
    /\b(flyctl|fly)\s+deploy\b/.test(stmt) ||
    /\bkubectl\s+(apply|create|replace|delete|rollout|scale|set)\b/.test(stmt) ||
    /\bhelm\s+(upgrade|install|uninstall|delete|rollback)\b/.test(stmt) ||
    /\bdocker\s+push\b/.test(stmt) ||
    /\bnpm\s+publish\b/.test(stmt) ||
    /\bgem\s+push\b/.test(stmt)
  );
}

// ---------------------------------------------------------------------------
// Per-statement assessment (first match wins, most specific first)
// ---------------------------------------------------------------------------

function deny(rule: string, reason: string): ShellVerdict {
  return { action: 'deny', rule, reason };
}

function ask(rule: string, reason: string): ShellVerdict {
  return { action: 'ask', rule, reason };
}

function allowNoted(rule: string, note: string): ShellVerdict {
  return { action: 'allow', rule, reason: '', note };
}

function assessStatement(stmt: string, cfg: ShellPolicyConfig): ShellVerdict {
  const words = wordsOf(stmt);

  // ---- deny rules ----------------------------------------------------------
  if (isGitSubcommand(words, 'push') && hasForcePushFlag(stmt, words)) {
    return deny(
      'git-force-push',
      'Force pushes (--force) rewrite published history and can destroy teammates\' work. ' +
        'Push a new branch instead (git push origin HEAD:refs/heads/<new-branch>), ' +
        'or use --force-with-lease after confirming nobody else builds on this branch.',
    );
  }
  if (isGitSubcommand(words, 'filter-branch')) {
    return deny(
      'git-filter-branch',
      'git filter-branch rewrites history and is deprecated because of its footguns. ' +
        'Use git filter-repo on a dedicated clone instead.',
    );
  }
  if (
    isGitSubcommand(words, 'reflog') &&
    /(^|\s)--expire(-unreachable)?=now(\s|$)/.test(stmt)
  ) {
    return deny(
      'git-reflog-expire',
      'Expiring the reflog with --expire=now destroys the recovery path for rewritten refs. ' +
        'If this is really intended, run it manually outside the agent session.',
    );
  }
  const rm = parseRm(words);
  if (rm !== null) {
    const catastrophic = rm.targets.some(isCatastrophicRmTarget);
    const dangerous = rm.recursive && rm.targets.some(isDangerousRmTarget);
    if (catastrophic || dangerous) {
      return deny(
        'rm-destructive-target',
        'rm targets the filesystem root, the home directory, or an absolute path. ' +
          'Delete relative paths inside the repository instead (e.g. rm -rf ./build).',
      );
    }
  }
  if (isPipeToShell(stmt)) {
    return deny(
      'pipe-to-shell',
      'Piping a download straight into a shell executes unreviewed code. ' +
        'Download to a file first, review it, then run it: curl -fsSL <url> -o script.sh && sh script.sh',
    );
  }
  if (isDbConsole(stmt) && SQL_DESTRUCTIVE_RE.test(stmt)) {
    return deny(
      'sql-drop-truncate',
      'DROP/TRUNCATE against a database via a console command. ' +
        'Run destructive SQL manually with a backup and a change record.',
    );
  }
  if (isChmodRecursive777(words)) {
    return deny(
      'chmod-recursive-777',
      'chmod -R 777 opens every file to every user. ' +
        'Use a tighter mode (e.g. 750 for dirs, 640 for files) or fix ownership instead.',
    );
  }

  // ---- ask rules -----------------------------------------------------------
  if (isGitSubcommand(words, 'push')) {
    if (/(^|\s)(--delete|-d)(\s|$)/.test(stmt)) {
      return ask(
        'git-push-delete',
        'This deletes a remote branch. Deleted branches are hard to recover for everyone building on them.',
      );
    }
    return ask(
      'git-push',
      'git push publishes commits to the shared remote. Confirm the branch and remote are correct.',
    );
  }
  if (isGitSubcommand(words, 'reset') && /(^|\s)--hard(\s|$)/.test(stmt)) {
    return ask(
      'git-reset-hard',
      'git reset --hard permanently discards uncommitted changes.',
    );
  }
  if (isGitSubcommand(words, 'branch') && /(^|\s)-D(\s|$)/.test(stmt)) {
    return ask(
      'git-branch-delete',
      'git branch -D force-deletes a branch, including unmerged commits.',
    );
  }
  if (isMigrationCommand(stmt)) {
    if (cfg.approvals.migrations === 'not-required') {
      return allowNoted(
        'migration',
        'sdlc-guard: migration command allowed by .ai/project.yml (approvals.migrations: not-required).',
      );
    }
    return ask(
      'migration',
      'Database migrations change schema state. Confirm the change is intended and reversible (backup/rollback plan).',
    );
  }
  if (isDeploymentCommand(stmt)) {
    if (cfg.approvals.deployment === 'not-required') {
      return allowNoted(
        'deployment',
        'sdlc-guard: deployment command allowed by .ai/project.yml (approvals.deployment: not-required).',
      );
    }
    return ask(
      'deployment',
      'This looks like a deployment action. Confirm the target environment and change window.',
    );
  }
  const start = commandStart(words);
  if (start > 0 && words.slice(0, start).includes('sudo')) {
    return ask('sudo', 'sudo runs with elevated privileges. Confirm the command is necessary.');
  }

  return { action: 'allow', rule: 'default', reason: '' };
}
