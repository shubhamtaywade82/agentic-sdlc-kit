/**
 * sdlc-guard — Claude Code mod entry point.
 *
 * Destructive-operation governance:
 *   - tool.call {tool:'Bash'}                    → shell command policy (deny/ask/allow)
 *   - tool.call {tool:['Edit','Write','NotebookEdit']} → protected-path policy
 *
 * Both registrations chain `.catch(...)` so any internal error or timeout
 * REFUSES the action (fail closed) instead of letting it through.
 *
 * Static-analysis notes: every mods-API call is written in full ($.ui.log,
 * $.fs.read, ...), event names are string literals, `$` is never assigned,
 * destructured or captured, and `$` is only passed to `loadGuardConfig`, a
 * top-level function of this same file.
 */

import { assessCommand } from '../policies/shell.ts';
import { assessPath } from '../policies/files.ts';
import { defaultGuardConfig, parseGuardProfile } from '../policies/config.ts';
import type { GuardConfig } from '../policies/config.ts';

/** Loaded once per plugin load (session reload picks up profile changes). */
let cfgCache: GuardConfig | null = null;

async function loadGuardConfig($: ModApi): Promise<GuardConfig> {
  if (cfgCache !== null) return cfgCache;
  let cfg: GuardConfig;
  try {
    if (await $.fs.exists('.ai/project.yml')) {
      cfg = parseGuardProfile(await $.fs.read('.ai/project.yml'));
    } else {
      cfg = defaultGuardConfig();
    }
  } catch (err) {
    // Fail-safe defaults: approvals required, default protected paths. Fail CLOSED.
    $.ui.log(
      'sdlc-guard: could not read .ai/project.yml — using fail-safe defaults (' + String(err) + ')',
    );
    cfg = defaultGuardConfig();
  }
  cfgCache = cfg;
  return cfg;
}

export function register(on: OnFn, options: RegisterOptions): void {
  void options;

  // -----------------------------------------------------------------------
  // Bash commands: destructive shell governance
  // -----------------------------------------------------------------------
  on('tool.call', { tool: 'Bash' },
    async ($, e, next) => {
      const cfg = await loadGuardConfig($);
      const command = typeof e.command === 'string' ? e.command : '';
      const verdict = assessCommand(command, cfg);

      if (verdict.action === 'deny') {
        $.ui.log('sdlc-guard: denied [' + verdict.rule + '] ' + command);
        return { deny: 'sdlc-guard: ' + verdict.reason };
      }

      if (verdict.action === 'allow') {
        if (verdict.note !== undefined) $.ui.log(verdict.note);
        return next(e);
      }

      // ask: modal approval, default answer Refuse (rejection/dismissal = refuse)
      let answer = 'Refuse';
      try {
        answer = await $.ui.ask(
          'sdlc-guard: ' + verdict.rule + ' — run this command?\n' + command,
          ['Run it', 'Refuse'],
        );
      } catch {
        answer = 'Refuse';
      }
      if (answer === 'Run it') {
        $.ui.log('sdlc-guard: user approved [' + verdict.rule + '] ' + command);
        return next(e);
      }
      $.ui.log('sdlc-guard: user refused [' + verdict.rule + '] ' + command);
      return {
        deny:
          'sdlc-guard: ' +
          verdict.rule +
          ' was refused. ' +
          verdict.reason +
          ' Ask the user for explicit approval to proceed.',
      };
    },
  ).catch(() => ({ deny: 'sdlc-guard: internal error — refusing (fail closed)' }));

  // -----------------------------------------------------------------------
  // File edits: protected paths (Edit / Write / NotebookEdit)
  // -----------------------------------------------------------------------
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] },
    async ($, e, next) => {
      const cfg = await loadGuardConfig($);
      const path = typeof e.file_path === 'string' ? e.file_path : '';
      const verdict = assessPath(path, cfg);
      if (verdict.action === 'deny') {
        $.ui.log('sdlc-guard: denied [' + verdict.rule + '] ' + path);
        return { deny: 'sdlc-guard: ' + verdict.reason };
      }
      return next(e);
    },
  ).catch(() => ({ deny: 'sdlc-guard: internal error — refusing (fail closed)' }));
}
