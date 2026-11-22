// plugins/sdlc-guard/policies/classify.ts
//
// Token-level classifier for Bash commands. Returns every destructive action
// found in the command, including ones hidden behind wrappers (sudo, env,
// xargs, timeout), `sh -c '...'`, and `eval`. Unknown programs classify as
// nothing (allowed); nesting too deep to inspect classifies as shell.unparsed,
// which requires approval, so the classifier never silently passes what it
// could not read.

import { parseCommand, type SimpleCommand } from './command-parser';
import type { ClassifiedAction } from './types';

const WRAPPERS = new Set(['sudo', 'doas', 'env', 'time', 'nohup', 'nice', 'command', 'exec', 'builtin', 'timeout']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const MAX_DEPTH = 4;

export function classifyCommand(command: string): ClassifiedAction[] {
  return classifyText(command, 0);
}

function classifyText(text: string, depth: number): ClassifiedAction[] {
  if (depth > MAX_DEPTH) {
    return [{ category: 'shell.unparsed', impact: 'local', scope: { paths: [] } }];
  }
  return parseCommand(text).flatMap((cmd) => classifySimple(cmd, depth));
}

function baseName(program: string): string {
  return program.split('/').pop() ?? program;
}

function isAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** Drop wrapper programs, their flags and leading VAR=value assignments. */
function unwrap(argv: string[]): { argv: string[]; production: boolean } {
  let rest = argv;
  let production = false;
  for (;;) {
    while (rest[0] !== undefined && isAssignment(rest[0])) {
      if (/^(RAILS|NODE)_ENV=production$/.test(rest[0])) production = true;
      rest = rest.slice(1);
    }
    const head = rest[0];
    if (head === undefined || !WRAPPERS.has(baseName(head))) return { argv: rest, production };
    rest = rest.slice(1);
    while (rest[0] !== undefined && (rest[0].startsWith('-') || isAssignment(rest[0]) || /^\d+(\.\d+)?$/.test(rest[0]))) {
      if (/^(RAILS|NODE)_ENV=production$/.test(rest[0])) production = true;
      rest = rest.slice(1);
    }
  }
}

function classifySimple(cmd: SimpleCommand, depth: number): ClassifiedAction[] {
  const { argv, production } = unwrap(cmd.argv);
  const [program, ...args] = argv;
  if (program === undefined) return [];
  const name = baseName(program);
  if (name === 'xargs') return classifySimple({ argv: skipXargsOptions(args), piped: false }, depth);
  if (name === 'eval') return classifyText(args.join(' '), depth + 1);
  if (SHELLS.has(name)) return classifyShell(args, cmd.piped, depth);
  return classifyProgram(name, args, production);
}

function skipXargsOptions(args: string[]): string[] {
  let i = 0;
  while (i < args.length && (args[i] as string).startsWith('-')) {
    // -I/-n/-P/-L/-d/-s take a separate value when not attached.
    i += ['-I', '-n', '-P', '-L', '-d', '-s', '-E'].includes(args[i] as string) ? 2 : 1;
  }
  return args.slice(i);
}

function classifyShell(args: string[], piped: boolean, depth: number): ClassifiedAction[] {
  const cIndex = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
  if (cIndex !== -1) return classifyText(args[cIndex + 1] ?? '', depth + 1);
  if (piped) return [{ category: 'shell.remote-exec', impact: 'local', scope: { paths: [] } }];
  return [];
}

function action(category: ClassifiedAction['category'], impact: ClassifiedAction['impact'], paths: string[] = []): ClassifiedAction {
  return { category, impact, scope: { paths } };
}

function shortFlagLetters(args: string[]): Set<string> {
  const letters = new Set<string>();
  for (const a of args) {
    if (/^-[A-Za-z]+$/.test(a)) for (const ch of a.slice(1)) letters.add(ch);
  }
  return letters;
}

function classifyProgram(name: string, args: string[], production: boolean): ClassifiedAction[] {
  switch (name) {
    case 'rm':
      return classifyRm(args);
    case 'find':
      return args.includes('-delete') ? [action('file.delete', 'local')] : [];
    case 'git':
      return classifyGit(args);
    case 'psql':
    case 'mysql':
    case 'sqlite3':
    case 'mongosh':
      return classifySql(args, production);
    case 'rails':
    case 'rake':
      return classifyDbTask(args, production);
    case 'prisma':
    case 'knex':
    case 'sequelize':
      return args.includes('migrate') ? [action('db.migrate', 'local')] : [];
    case 'npm':
    case 'pnpm':
    case 'yarn':
      return args[0] === 'publish' ? [action('release.publish', 'production')] : [];
    case 'kubectl':
      return ['apply', 'delete', 'replace', 'patch'].includes(args[0] ?? '') ? [action('release.deploy', 'production')] : [];
    case 'helm':
      return ['install', 'upgrade', 'uninstall'].includes(args[0] ?? '') ? [action('release.deploy', 'production')] : [];
    case 'terraform':
      return ['apply', 'destroy'].includes(args[0] ?? '') ? [action('release.deploy', 'production')] : [];
    default:
      return [];
  }
}

function classifyRm(args: string[]): ClassifiedAction[] {
  const recursive = args.includes('--recursive') || shortFlagLetters(args).has('r') || shortFlagLetters(args).has('R');
  if (!recursive) return [];
  return [action('file.delete', 'local', args.filter((a) => !a.startsWith('-')))];
}

function classifySql(args: string[], production: boolean): ClassifiedAction[] {
  const text = args.join(' ');
  if (!/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE)\b/i.test(text)) return [];
  const prodTarget = production || /prod/i.test(text);
  return [action(prodTarget ? 'db.mutate-production' : 'db.mutate-dev', prodTarget ? 'production' : 'local')];
}

function classifyDbTask(args: string[], production: boolean): ClassifiedAction[] {
  const task = args.find((a) => a.startsWith('db:'));
  if (task === undefined) return [];
  if (/^db:(migrate|rollback|schema:load)/.test(task)) {
    return production ? [action('db.mutate-production', 'production')] : [action('db.migrate', 'local')];
  }
  if (/^db:(drop|reset|seed|truncate)/.test(task)) {
    return [action(production ? 'db.mutate-production' : 'db.mutate-dev', production ? 'production' : 'local')];
  }
  return [];
}

/** Skip git's global options (-C <dir>, -c <k=v>, --no-pager, ...). */
function gitSubcommand(args: string[]): { sub: string; rest: string[] } | null {
  let i = 0;
  while (i < args.length && (args[i] as string).startsWith('-')) {
    i += ['-C', '-c'].includes(args[i] as string) ? 2 : 1;
  }
  const sub = args[i];
  return sub === undefined ? null : { sub, rest: args.slice(i + 1) };
}

function classifyGit(args: string[]): ClassifiedAction[] {
  const parsed = gitSubcommand(args);
  if (parsed === null) return [];
  const { sub, rest } = parsed;
  const letters = shortFlagLetters(rest);
  switch (sub) {
    case 'push':
      return isForcePush(rest) ? [action('git.force-push', 'shared-branch')] : [];
    case 'rebase':
      return [action('git.rebase', 'shared-branch')];
    case 'reset':
      return rest.includes('--hard') ? [action('git.destructive', 'local')] : [];
    case 'clean':
      return letters.has('f') || rest.includes('--force') ? [action('git.destructive', 'local')] : [];
    case 'checkout':
      return rest.includes('--') || rest.includes('-f') || rest.includes('--force') ? [action('git.destructive', 'local')] : [];
    case 'restore':
      return rest.includes('--staged') && !rest.includes('--worktree') ? [] : [action('git.destructive', 'local')];
    case 'branch':
      return letters.has('D') ? [action('git.destructive', 'local')] : [];
    case 'stash':
      return rest[0] === 'drop' || rest[0] === 'clear' ? [action('git.destructive', 'local')] : [];
    default:
      return [];
  }
}

/** Force semantics: -f/--force(-with-lease|-if-includes), --mirror, --delete,
 *  a `+refspec`, or a `:ref` deletion. */
function isForcePush(rest: string[]): boolean {
  if (rest.some((a) => a === '--force' || a.startsWith('--force-') || a === '--mirror' || a === '--delete')) return true;
  if (rest.some((a) => a.startsWith('+') || (a.startsWith(':') && a.length > 1))) return true;
  return shortFlagLetters(rest).has('f') || shortFlagLetters(rest).has('d');
}
