// plugins/secret-guard/policies/git-command.ts
//
// Which Bash commands create or publish git history, found from TOKENS (not a
// substring regex) so that git's global options (`git -C d commit`), wrappers
// (`sudo`, `env`, `command`), nested shells (`bash -lc '...'`, `eval`) and
// quoting are seen through, and quoted text (`echo "git push"`) is not a command.
//
// Mirrors the wrapper/shell handling of sdlc-guard's classifier (vendored
// parser in ./command-parser). It cannot expand aliases, variables or $(...);
// nesting too deep to read is reported as an UNCERTAIN commit, so the caller
// scans instead of silently allowing what it could not read.

import { parseCommand, type SimpleCommand } from './command-parser';

export interface GitAction {
  action: 'commit' | 'push';
  /** The commit also takes tracked working-tree changes (-a/--all or a pathspec). */
  stageTracked: boolean;
  /** The command could not be fully read; the action is assumed. */
  uncertain: boolean;
}

const WRAPPERS = new Set(['sudo', 'doas', 'env', 'time', 'nohup', 'nice', 'command', 'exec', 'builtin', 'timeout']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const MAX_DEPTH = 4;

/** git global options that take a separate value (`-C dir`, `--git-dir path`). */
const GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);
/** `git commit` flags whose value is the next token (when not attached with `=`). */
const COMMIT_LONG_WITH_VALUE = new Set([
  '--message', '--file', '--author', '--date', '--template', '--reuse-message',
  '--reedit-message', '--fixup', '--squash', '--cleanup', '--trailer',
]);
const COMMIT_SHORT_WITH_VALUE = 'mFCct';

export function parseGitActions(command: string): GitAction[] {
  return fromText(command, 0);
}

function fromText(text: string, depth: number): GitAction[] {
  if (depth > MAX_DEPTH) return [{ action: 'commit', stageTracked: true, uncertain: true }];
  return parseCommand(text).flatMap((cmd) => fromSimple(cmd, depth));
}

function baseName(program: string): string {
  return program.split('/').pop() ?? program;
}

function isAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** Drop wrapper programs, their flags and leading VAR=value assignments. */
function unwrap(argv: string[]): string[] {
  let rest = argv;
  for (;;) {
    while (rest[0] !== undefined && isAssignment(rest[0])) rest = rest.slice(1);
    const head = rest[0];
    if (head === undefined || !WRAPPERS.has(baseName(head))) return rest;
    rest = rest.slice(1);
    while (rest[0] !== undefined && (rest[0].startsWith('-') || isAssignment(rest[0]) || /^\d+(\.\d+)?$/.test(rest[0]))) {
      rest = rest.slice(1);
    }
  }
}

function fromSimple(cmd: SimpleCommand, depth: number): GitAction[] {
  const [program, ...args] = unwrap(cmd.argv);
  if (program === undefined) return [];
  const name = baseName(program);
  if (name === 'eval') return fromText(args.join(' '), depth + 1);
  if (SHELLS.has(name)) {
    const cIndex = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    return cIndex === -1 ? [] : fromText(args[cIndex + 1] ?? '', depth + 1);
  }
  return name === 'git' ? fromGit(args) : [];
}

function fromGit(args: string[]): GitAction[] {
  let i = 0;
  while (i < args.length && (args[i] as string).startsWith('-')) {
    i += GLOBAL_WITH_VALUE.has(args[i] as string) ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === 'push') return [{ action: 'push', stageTracked: false, uncertain: false }];
  if (sub === 'commit') {
    return [{ action: 'commit', stageTracked: commitTakesTracked(rest), uncertain: false }];
  }
  return [];
}

/** `-a`/`--all`, or any pathspec: the commit reads the working tree, not only the index. */
function commitTakesTracked(args: string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '--') return i + 1 < args.length;
    if (arg === '--all') return true;
    if (arg.startsWith('--')) {
      if (COMMIT_LONG_WITH_VALUE.has(arg)) i += 1; // value is the next token
      continue;
    }
    if (arg.startsWith('-')) {
      const outcome = scanShortCluster(arg);
      if (outcome === 'all') return true;
      if (outcome === 'value-next') i += 1;
      continue;
    }
    return true; // a bare word that is not a flag value: a pathspec
  }
  return false;
}

/** Walk a short-flag cluster like `-am`: `a` before a value flag means --all. */
function scanShortCluster(cluster: string): 'all' | 'value-next' | 'none' {
  for (let k = 1; k < cluster.length; k += 1) {
    const letter = cluster[k] as string;
    if (letter === 'a') return 'all';
    if (COMMIT_SHORT_WITH_VALUE.includes(letter)) {
      return k === cluster.length - 1 ? 'value-next' : 'none'; // `-mmsg`: value attached
    }
  }
  return 'none';
}
