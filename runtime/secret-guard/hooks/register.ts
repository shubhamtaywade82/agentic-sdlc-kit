/**
 * secret-guard — Claude Code mod entry point.
 *
 * Secret detection on the way INTO the repository:
 *   - tool.call {tool:['Write','NotebookEdit']} → scan e.content / e.new_source
 *   - tool.call {tool:'Edit'}                   → scan e.new_string (what lands)
 *   - tool.call {tool:'Bash'}                   → for git commit, scan the staged diff
 *
 * Also asks for confirmation before writing production-flavored env files
 * (.env.production / .env.live / .env.prod …).
 *
 * All three registrations chain `.catch(...)` so internal errors refuse the
 * write/commit (fail closed).
 *
 * v1 scope: write + commit scanning. Tool-output redaction, push checks and
 * gitleaks integration are on the roadmap (see README).
 */

import { isProdEnvPath, scanText } from '../policies/detect.ts';
import type { Finding } from '../policies/detect.ts';

function describeFindings(findings: Finding[]): string {
  return findings.map((f) => f.patternId + ' (line ' + f.line + ')').join(', ');
}

function denyForWrite(path: string, findings: Finding[]): { deny: string } {
  // pattern ids + line numbers only — never the secret, never the full diff
  const ids: string[] = [];
  const lines: number[] = [];
  for (const f of findings) {
    if (!ids.includes(f.patternId)) ids.push(f.patternId);
    if (!lines.includes(f.line)) lines.push(f.line);
  }
  return {
    deny:
      'secret-guard: refusing to write ' +
      path +
      ': possible ' +
      ids.join(', ') +
      ' on line(s) ' +
      lines.join(', ') +
      '. Move the value to an environment variable or secret manager, then retry.',
  };
}

/** git commit anywhere in the command (incl. --amend and compound commands). */
function isGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

export function register(on: OnFn, options: RegisterOptions): void {
  void options;

  // -----------------------------------------------------------------------
  // Write / NotebookEdit: scan the full new content
  // -----------------------------------------------------------------------
  on('tool.call', { tool: ['Write', 'NotebookEdit'] },
    async ($, e, next) => {
      const path = typeof e.file_path === 'string' ? e.file_path : '';
      const content =
        typeof e.content === 'string'
          ? e.content
          : typeof e.new_source === 'string'
            ? e.new_source
            : '';
      const findings = scanText(content);
      if (findings.length > 0) {
        $.ui.log('secret-guard: denied write to ' + path + ' (' + describeFindings(findings) + ')');
        return denyForWrite(path, findings);
      }
      if (isProdEnvPath(path)) {
        let answer = 'Refuse';
        try {
          answer = await $.ui.ask(
            'secret-guard: ' + path + ' looks like a production env file — write it?',
            ['Write it anyway', 'Refuse'],
          );
        } catch {
          answer = 'Refuse';
        }
        if (answer !== 'Write it anyway') {
          $.ui.log('secret-guard: user refused writing ' + path);
          return {
            deny:
              'secret-guard: production env file write refused. Keep production secrets in the ' +
              'deployment environment secret store, not in the repository.',
          };
        }
        $.ui.log('secret-guard: user approved writing ' + path);
      }
      return next(e);
    },
  ).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // -----------------------------------------------------------------------
  // Edit: scan only what lands (new_string)
  // -----------------------------------------------------------------------
  on('tool.call', { tool: 'Edit' },
    async ($, e, next) => {
      const path = typeof e.file_path === 'string' ? e.file_path : '';
      const newText = typeof e.new_string === 'string' ? e.new_string : '';
      const findings = scanText(newText);
      if (findings.length > 0) {
        $.ui.log('secret-guard: denied edit to ' + path + ' (' + describeFindings(findings) + ')');
        return denyForWrite(path, findings);
      }
      if (isProdEnvPath(path)) {
        let answer = 'Refuse';
        try {
          answer = await $.ui.ask(
            'secret-guard: ' + path + ' looks like a production env file — edit it?',
            ['Edit it anyway', 'Refuse'],
          );
        } catch {
          answer = 'Refuse';
        }
        if (answer !== 'Edit it anyway') {
          $.ui.log('secret-guard: user refused editing ' + path);
          return {
            deny:
              'secret-guard: production env file edit refused. Keep production secrets in the ' +
              'deployment environment secret store, not in the repository.',
          };
        }
        $.ui.log('secret-guard: user approved editing ' + path);
      }
      return next(e);
    },
  ).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));

  // -----------------------------------------------------------------------
  // Bash: scan the staged diff before git commit runs
  // -----------------------------------------------------------------------
  on('tool.call', { tool: 'Bash' },
    async ($, e, next) => {
      const command = typeof e.command === 'string' ? e.command : '';
      if (!isGitCommit(command)) return next(e);

      let diff;
      try {
        diff = await $.process.run(['git', 'diff', '--cached']);
      } catch {
        diff = undefined;
      }
      if (diff === undefined || diff.exitCode !== 0) {
        // Fail closed: if we cannot verify the staged diff, we cannot allow the commit.
        return {
          deny:
            'secret-guard: could not read the staged diff (git diff --cached failed) — ' +
            'refusing the commit. Check the git state (are we inside a work tree?) and retry.',
        };
      }
      const findings = scanText(diff.stdout);
      if (findings.length > 0) {
        $.ui.log('secret-guard: denied commit (' + describeFindings(findings) + ')');
        // The diff itself is deliberately NOT echoed to the model — only ids and lines.
        return {
          deny:
            'secret-guard: staged changes contain possible secrets: ' +
            describeFindings(findings) +
            '. Unstage the affected file(s) (git restore --staged <file>), rotate the ' +
            'credential if it was ever real, move the value to a secret manager, and commit again.',
        };
      }
      return next(e);
    },
  ).catch(() => ({ deny: 'secret-guard: internal error — refusing (fail closed)' }));
}
