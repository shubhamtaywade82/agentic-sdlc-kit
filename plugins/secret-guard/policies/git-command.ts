// plugins/secret-guard/policies/git-command.ts
//
// Parse git history mutations from Bash commands. Pushes are deliberately
// restricted to a small, auditable grammar: a bare push or one remote,
// with only flags that do not select refs. Any uncertain target scope is
// returned as uncertain so the hook can deny before running a scan.

import { parseCommand, type SimpleCommand } from './command-parser';

export interface GitAction {
  action: 'commit' | 'push';
  stageTracked: boolean;
  /** The command or push target could not be proven safe. The caller MUST deny. */
  uncertain: boolean;
}

const WRAPPERS = new Set(['sudo', 'doas', 'env', 'time', 'nohup', 'nice', 'command', 'exec', 'builtin', 'timeout']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const MAX_DEPTH = 4;
const GLOBAL_WITH_VALUE = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix',
  '--exec-path', '--html-path', '--man-path', '--info-path',
]);
const COMMIT_LONG_WITH_VALUE = new Set([
  '--message', '--file', '--author', '--date', '--template', '--reuse-message',
  '--reedit-message', '--fixup', '--squash', '--cleanup', '--trailer',
]);
const COMMIT_SHORT_WITH_VALUE = 'mFCct';
const REPOSITORY_ENV_NAMES = new Set([
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CEILING_DIRECTORIES',
]);

// These options affect transport/output only. Ref-selection and configuration
// flags are intentionally excluded; scanning all local refs is still required.
const SAFE_PUSH_FLAGS = new Set([
  '-v', '--verbose', '-q', '--quiet', '--porcelain', '--progress',
  '--no-progress', '--dry-run', '--atomic', '--force',
]);

export function parseGitActions(command: string): GitAction[] {
  return fromText(command, 0);
}

function fromText(text: string, depth: number): GitAction[] {
  if (depth > MAX_DEPTH) return [{ action: 'commit', stageTracked: true, uncertain: true }];
  let directoryChanged = false;
  const actions: GitAction[] = [];
  for (const cmd of parseCommand(text)) {
    const [program] = unwrap(cmd.argv);
    const name = program === undefined ? '' : baseName(program);
    if (name === 'cd' || name === 'pushd' || name === 'popd') {
      directoryChanged = true;
      continue;
    }
    if (hasRepositoryEnvOverride(cmd.argv)) directoryChanged = true;
    if (name === 'export' && cmd.argv.slice(1).some(isRepositoryEnvAssignment)) {
      directoryChanged = true;
      continue;
    }
    const found = fromSimple(cmd, depth);
    actions.push(...found.map((action) =>
      directoryChanged ? { ...action, uncertain: true } : action,
    ));
  }
  return actions;
}

function baseName(program: string): string {
  return program.split('/').pop() ?? program;
}

function isAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function isRepositoryEnvAssignment(token: string): boolean {
  const name = token.slice(0, token.indexOf('='));
  return REPOSITORY_ENV_NAMES.has(name);
}

function hasRepositoryEnvOverride(argv: string[]): boolean {
  return argv.some(isRepositoryEnvAssignment);
}

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
  let hasGlobalOptions = false;
  while (i < args.length && (args[i] as string).startsWith('-')) {
    hasGlobalOptions = true;
    i += GLOBAL_WITH_VALUE.has(args[i] as string) ? 2 : 1;
  }
  const sub = args[i];
  // Unknown global options may take a separate value. If a history-changing
  // subcommand appears later, classify it as uncertain rather than missing it.
  if (sub !== 'push' && sub !== 'commit' && hasGlobalOptions) {
    const laterPush = args.indexOf('push', i + 1);
    const laterCommit = args.indexOf('commit', i + 1);
    if (laterPush !== -1) return [{ action: 'push', stageTracked: false, uncertain: true }];
    if (laterCommit !== -1) return [{ action: 'commit', stageTracked: true, uncertain: true }];
  }
  const rest = args.slice(i + 1);
  if (sub === 'push') {
    return [{
      action: 'push',
      stageTracked: false,
      uncertain: hasGlobalOptions || !isNarrowPush(rest),
    }];
  }
  if (sub === 'commit') {
    return [{ action: 'commit', stageTracked: commitTakesTracked(rest), uncertain: hasGlobalOptions }];
  }
  return [];
}

/** Accept only a bare push or one remote; never accept refspecs. */
function isNarrowPush(args: string[]): boolean {
  let remoteSeen = false;
  for (const arg of args) {
    if (SAFE_PUSH_FLAGS.has(arg)) continue;
    if (arg.startsWith('-')) return false;
    if (remoteSeen) return false;
    remoteSeen = true;
  }
  return true;
}

function commitTakesTracked(args: string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '--') return i + 1 < args.length;
    if (arg === '--all') return true;
    if (arg.startsWith('--')) {
      if (COMMIT_LONG_WITH_VALUE.has(arg)) i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      const outcome = scanShortCluster(arg);
      if (outcome === 'all') return true;
      if (outcome === 'value-next') i += 1;
      continue;
    }
    return true;
  }
  return false;
}

function scanShortCluster(cluster: string): 'all' | 'value-next' | 'none' {
  for (let k = 1; k < cluster.length; k += 1) {
    const letter = cluster[k] as string;
    if (letter === 'a') return 'all';
    if (COMMIT_SHORT_WITH_VALUE.includes(letter)) {
      return k === cluster.length - 1 ? 'value-next' : 'none';
    }
  }
  return 'none';
}
