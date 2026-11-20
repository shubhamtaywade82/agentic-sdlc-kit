// plugins/secret-guard/hooks/register.ts
//
// secret-guard: keeps secrets out of files, git history, and the model's
// context. Three real gates on tool.call:
//
//   1. Write / NotebookEdit / Edit — scan the content being written
//      (e.content / e.new_source / e.new_string; tool arguments are FIELDS
//      of a tool.call event) and refuse the write when a secret matches.
//   2. Bash `git commit` / `git push` — read the staged diff with
//      $.process.run(['git','diff','--cached']) and scan it BEFORE the
//      command runs; a secret in the diff refuses the commit.
//   3. Tool results — after `await next(e)`, redact secrets from the
//      result's text (the field the model reads) and return the copy.
//
// Every gating registration chains .catch(...) so an internal error or
// timeout REFUSES the action (fail closed) — the host would otherwise skip
// a failed hook and let the write/commit through.
//
// Static-analysis rules honored here: full $.x.y(...) calls; string-literal
// event names; `$` passed only to getPolicy, a top-level function of this
// file; imports are relative files of this plugin plus the 'claude-code'
// types.

import type { ModsApi, On, ToolCallEvent } from 'claude-code';
import { DEFAULT_REDACTION_POLICY, redactSecrets, scanText } from '../policies/detect';
import type { RedactionPolicy } from '../policies/detect';

function getPolicy($: ModsApi): RedactionPolicy {
  return $.state.get<RedactionPolicy>({ plugin: 'secret-guard', key: 'policy' }) ?? DEFAULT_REDACTION_POLICY;
}

/** Scan content about to be written; returns a deny reason or null. */
function scanWrite($: ModsApi, content: string, filePath?: string): string | null {
  const policy = getPolicy($);
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

export function register(on: On): void {
  // 1. Writes: Write (e.file_path + e.content) and NotebookEdit
  //    (e.notebook_path + e.new_source).
  on('tool.call', { tool: ['Write', 'NotebookEdit'] }, async ($, e: ToolCallEvent, next) => {
    const path = e.file_path ?? e.notebook_path;
    const content = e.content ?? e.new_source;
    if (typeof content !== 'string' || content === '') return next(e);
    const deny = scanWrite($, content, typeof path === 'string' ? path : undefined);
    if (deny !== null) return { deny };
    return next(e);
  }).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // 1b. Edits: scan the replacement text (e.new_string).
  on('tool.call', { tool: 'Edit' }, async ($, e: ToolCallEvent, next) => {
    const path = e.file_path;
    const content = e.new_string;
    if (typeof content !== 'string' || content === '') return next(e);
    const deny = scanWrite($, content, typeof path === 'string' ? path : undefined);
    if (deny !== null) return { deny };
    return next(e);
  }).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // 2. Git: scan the staged diff before a commit or push enters history.
  on('tool.call', { tool: 'Bash' }, async ($, e: ToolCallEvent, next) => {
    const command = e.command;
    if (typeof command !== 'string') return next(e);
    if (!/\bgit\s+(commit|push)\b/.test(command)) return next(e);
    // Read what is about to be committed — before the command runs.
    const diff = await $.process.run(['git', 'diff', '--cached']);
    if (diff.exitCode !== 0) {
      // Could not read the staged changes (not a repo, git error): fail
      // closed — an unverifiable commit is not a verified-clean one.
      $.ui.log('secret-guard: could not read staged changes; refusing git operation');
      return {
        deny:
          'secret-guard: could not read the staged changes (git diff --cached failed), so they ' +
          'were not scanned for secrets. Run git add and retry from a git repository.',
      };
    }
    const policy = getPolicy($);
    const result = scanText(diff.stdout, policy, 'git-staged');
    if (result.outcome === 'findings') {
      $.ui.log(
        `secret-guard: blocked git operation — ${result.findings.length} secret(s) in staged changes`,
      );
      return {
        deny:
          `secret-guard: the staged changes contain ${result.findings.length} possible secret(s) ` +
          `(${result.findings.map((f) => f.kind).join(', ')}). Unstage the secret, move it to an ` +
          'environment variable or secret manager, and retry. If a real key was committed, rotate it.',
      };
    }
    if (result.outcome === 'failed') {
      $.ui.log('secret-guard: staged-diff scan failed; refusing git operation');
      return { deny: 'secret-guard: staged-diff scan failed; refusing to let the commit proceed unverified' };
    }
    return next(e);
  }).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // 3. Tool results: after the tool ran, redact secrets from the text the
  //    model reads. A denied call (r.deny) passes through untouched.
  on('tool.call', async ($, e: ToolCallEvent, next) => {
    const r = (await next(e)) as { deny?: unknown; text?: unknown } | undefined;
    if (r === null || typeof r !== 'object') return r;
    if (r.deny !== undefined) return r;
    if (typeof r.text !== 'string') return r;
    const policy = getPolicy($);
    const redacted = redactSecrets(r.text, policy, 'tool-output');
    if (redacted.findings.length > 0) {
      $.ui.log(`secret-guard: redacted ${redacted.findings.length} secret(s) from ${e.tool} output`);
      if (!redacted.fullyRedacted) {
        $.ui.log('secret-guard: WARNING — redaction could not be verified as complete');
      }
      return { ...r, text: redacted.redactedText };
    }
    return r;
  });
}
