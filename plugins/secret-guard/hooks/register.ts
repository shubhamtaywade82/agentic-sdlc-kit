// plugins/secret-guard/hooks/register.ts
//
// secret-guard: keeps secrets out of files, git history, and the model's
// context. Three real gates on tool.call:
//
//   1. Write / NotebookEdit / Edit — scan the content being written
//      (e.content / e.new_source / e.new_string; tool arguments are FIELDS
//      of a tool.call event, narrowed per tool by the matcher) and refuse
//      the write when a secret matches.
//   2. Bash `git commit` / narrow `git push` — scan staged changes before
//      commits and all local refs that may be published before a push.
//      Ambiguous push targets, refspecs and directory changes are denied.
//   3. Tool results — after `await next(e)`, redact secrets from the
//      result's text (the field the model reads) and return the copy.
//
// Every gating registration chains .catch(...) so an internal error or
// timeout REFUSES the action (fail closed) — the host would otherwise skip
// a failed hook and let the write/commit through.
//
// Typed against the OFFICIAL engine declarations ('claude-code' — see
// .claude-plugin/types/claude-code/index.d.ts): $ is EngineInterface,
// event inputs are *Input, matchers narrow e to the tool variant, and
// state flows through the official atom/read/update helpers. NOTE: an
// offline `claude plugin validate` run types the atom ref against an
// EMPTY PluginState (its checker does not merge this plugin's contract)
// and so flags the atom() line above the same way it flags Claude
// Code's own turn-band example mod — the real engine lays the merged
// declarations at .claude-plugin/types/claude-code/index.d.ts and the
// same line typechecks cleanly there.
//
// Static-analysis rules honored here: full $.x.y(...) calls;
// string-literal event names; `$` passed only to getPolicy / scanWrite,
// top-level functions of this file; imports are relative files of this
// plugin plus the 'claude-code' types.

import type { EngineInterface, On, ToolCallInput, ToolCallResult } from 'claude-code';
import { atom, read } from 'claude-code';
import { DEFAULT_REDACTION_POLICY, redactSecrets, scanText } from '../policies/detect';
import { parseGitActions, type GitAction } from '../policies/git-command';
import type { RedactionPolicy } from '../policies/detect';

// The policy state key, declared in contract.d.ts. read() resolves to
// the stored policy or the module default (initial) when unset.
const POLICY = atom({ plugin: 'secret-guard', key: 'policy' } as const, DEFAULT_REDACTION_POLICY);

async function getPolicy($: EngineInterface): Promise<RedactionPolicy> {
  return read($, POLICY);
}

/** Scan content about to be written; returns a deny reason or null. */
async function scanWrite(
  $: EngineInterface,
  content: string,
  filePath?: string,
): Promise<string | null> {
  const policy = await getPolicy($);
  const result = scanText(content, policy, 'file-write', filePath);
  if (result.outcome === 'findings') {
    $.ui.log(
      `secret-guard: blocked write to ${filePath ?? '<unknown>'} — ${result.findings.length} secret(s) detected`,
    );
    return (
      `secret-guard: refusing to write ${filePath ?? 'file'}: ${result.findings.length} possible ` +
      `secret(s) detected (${result.findings.map((f) => f.kind).join(', ')}). Move the value to an ` +
      'environment variable or secret manager, then retry.'
    );
  }
  if (result.outcome === 'failed') {
    // INVARIANT: scanner failure is NOT a clean result. Fail closed for
    // writes so an unscanned file is never written.
    $.ui.log('secret-guard: scanner failed; fail-closed for write');
    return 'secret-guard: scanner failed; refusing to write unscanned content';
  }
  if (result.outcome === 'skipped-too-large') {
    // "Too large to scan" is suspicious for a write: refuse rather than
    // wave an unread file through.
    $.ui.log('secret-guard: content too large to scan; refusing (fail closed)');
    return 'secret-guard: content too large to scan; refusing to write unverified content';
  }
  return null;
}

interface GitRead {
  args: string[];
  /** Noun phrase used in messages: "the staged changes". */
  noun: string;
  source: 'git-staged' | 'git-push';
  advice: string;
}

const STAGED: GitRead = {
  args: ['git', 'diff', '--cached'],
  noun: 'the staged changes',
  source: 'git-staged',
  advice: 'Unstage the secret, move it to an environment variable or secret manager, and retry.',
};
const WORKTREE: GitRead = {
  args: ['git', 'diff'],
  noun: 'the tracked working-tree changes being committed',
  source: 'git-staged',
  advice: 'Remove the secret from the file, move it to an environment variable or secret manager, and retry.',
};
// Scan every local ref not already reachable from a remote-tracking ref.
// This is intentionally broader than a particular push.default/remote.push
// configuration, covering alternate branches and local tags conservatively.
const UNPUSHED: GitRead = {
  args: ['git', 'log', '-p', '--format=', '--all', '--not', '--remotes'],
  noun: 'the locally reachable commit history',
  source: 'git-push',
  advice: 'Remove the secret from history (amend or rewrite the commits) before pushing.',
};

/** What each parsed action needs scanned, in order, without duplicates. */
function gitReads(actions: GitAction[]): GitRead[] {
  const reads: GitRead[] = [];
  const add = (r: GitRead): void => {
    if (!reads.includes(r)) reads.push(r);
  };
  for (const a of actions) {
    if (a.action === 'commit') {
      add(STAGED);
      if (a.stageTracked) add(WORKTREE);
    } else {
      add(UNPUSHED);
    }
  }
  return reads;
}

async function scanGitRead($: EngineInterface, policy: RedactionPolicy, read: GitRead): Promise<string | null> {
  const out = await $.process.run(read.args);
  if (out.exitCode !== 0) {
    // Could not read it (not a repo, git error): an unverifiable operation is
    // not a verified-clean one.
    $.ui.log(`secret-guard: could not read ${read.noun}; refusing git operation`);
    return (
      `secret-guard: could not read ${read.noun} (${read.args.join(' ')} failed), so it was not ` +
      'scanned for secrets. Run from a git repository and retry.'
    );
  }
  const result = scanText(out.stdout, policy, read.source);
  if (result.outcome === 'clean') return null;
  if (result.outcome === 'findings') {
    $.ui.log(`secret-guard: blocked git operation — ${result.findings.length} secret(s) in ${read.noun}`);
    return (
      `secret-guard: ${read.noun} contain ${result.findings.length} possible secret(s) ` +
      `(${result.findings.map((f) => f.kind).join(', ')}). ${read.advice} If a real key was committed, rotate it.`
    );
  }
  // failed / skipped-too-large / skipped-ignored: NOT scanned, so not verified clean.
  $.ui.log(`secret-guard: ${read.noun} not scanned (${result.outcome}); refusing git operation`);
  return (
    `secret-guard: ${read.noun} were not scanned (${result.outcome}; too large to verify or the scan ` +
    'failed). Work in smaller pieces, or raise maxInputChars in the secret-guard policy, and retry.'
  );
}

export function register(on: On): void {
  // 1. Writes: Write (e.file_path + e.content) and NotebookEdit
  //    (e.notebook_path + e.new_source). The matcher narrows e to the
  //    Write|NotebookEdit union; variant fields are read after an
  //    e.tool check (the official shapes are readonly per-tool variants).
  on('tool.call', { tool: ['Write', 'NotebookEdit'] }, async ($, e, next) => {
    const path = e.tool === 'Write' ? e.file_path : e.notebook_path;
    const content = e.tool === 'Write' ? e.content : e.new_source;
    if (typeof content !== 'string' || content === '') return next(e);
    const deny = await scanWrite($, content, typeof path === 'string' ? path : undefined);
    if (deny !== null) return { deny };
    return next(e);
  }).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // 1b. Edits: scan the replacement text (e.new_string).
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const path = e.file_path;
    const content = e.new_string;
    if (typeof content !== 'string' || content === '') return next(e);
    const deny = await scanWrite($, content, typeof path === 'string' ? path : undefined);
    if (deny !== null) return { deny };
    return next(e);
  }).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // 2. Git: scan what a commit or push is about to put into (or publish from)
  //    history, found from the parsed command, not a substring regex.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = e.command;
    if (typeof command !== 'string') return next(e);
    const actions = parseGitActions(command);
    if (actions.length === 0) return next(e);
    if (actions.some((action) => action.uncertain)) {
      $.ui.log('secret-guard: refusing git history mutation with an unsupported or ambiguous target; the repository context or push ref scope cannot be verified');
      return { deny: 'secret-guard: refusing git operation because its repository context or push target scope cannot be verified. Use git push or git push <remote> with supported transport-only flags; refspecs, --all, --tags, --mirror, git global options, and cd-based directory changes are not supported.' };
    }
    const policy = await getPolicy($);
    for (const read of gitReads(actions)) {
      // Read before the command runs, so nothing has entered history yet.
      const deny = await scanGitRead($, policy, read);
      if (deny !== null) return { deny };
    }
    return next(e);
  }).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // 3. Tool results: after the tool ran, redact secrets from the text the
  //    model reads. A denied call (r.deny) passes through untouched.
  //    No matcher: e is the full (readonly, per-tool) union; only e.tool
  //    is read.
  on('tool.call', async ($, e: ToolCallInput, next) => {
    // The official engine always resolves next(e) to a ToolCallResult; a
    // host with nothing configured (e.g. the kit's MockRuntime without a
    // setHostResult) may resolve to nothing — pass that through untouched
    // instead of misreading it.
    const p = next(e);
    const r = (await p) as ToolCallResult<string> | undefined | null;
    if (r === null || typeof r !== 'object') return p;
    if (r.deny !== undefined) return r;
    if (typeof r.text !== 'string') return r;
    const policy = await getPolicy($);
    const redacted = redactSecrets(r.text, policy, 'tool-output');
    if (redacted.status === 'not-scanned') {
      // Too large to scan: surface a marker, never the unverified text.
      $.ui.log(`secret-guard: ${e.tool} output not scanned (over the size limit); withheld`);
      return { ...r, text: redacted.redactedText };
    }
    if (redacted.findings.length > 0) {
      $.ui.log(
        `secret-guard: redacted ${redacted.findings.length} secret(s) from ${e.tool} output`,
      );
      if (!redacted.fullyRedacted) {
        $.ui.log('secret-guard: WARNING — redaction could not be verified as complete');
      }
      return { ...r, text: redacted.redactedText };
    }
    return r;
    // Fail closed: if redaction itself throws, never surface the unverified
    // tool output to the model — refuse instead. (This registration is the
    // only one in secret-guard that previously lacked a .catch; the three
    // pre/post-write and git gates above already chain .catch.)
  }).catch(() => ({
    deny: 'secret-guard: redaction failed — refusing to surface unverified tool output (fail closed)',
  }));
}
