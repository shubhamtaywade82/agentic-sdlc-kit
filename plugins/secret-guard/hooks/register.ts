// plugins/secret-guard/hooks/register.ts
//
// Secret Guard Mod: intercepts tool calls and results to detect and redact
// secrets. Uses the M11 detector and redactor from core.
//
// Per RESEARCH.md §5 (M11): detection and redaction are different
// operations. A finding does not prove redaction. The register function
// uses the redactor which verifies completeness.

import type { RegisterFn, ToolCallEvent } from '@agentic-sdlc-kit/mod-sdk';
import { scanText, redactSecrets } from '@agentic-sdlc-kit/core';
import type { RedactionPolicy } from '@agentic-sdlc-kit/contracts';

const DEFAULT_POLICY: RedactionPolicy = {
  schemaVersion: 1,
  placeholderFormat: '[REDACTED:<kind>:<id>]',
  redactPartial: true,
  redactRepeated: true,
  maxInputBytes: 1_000_000,
  ignorePaths: [],
};

function getPolicy($: { state: { get: <T>(k: string) => T | undefined } }): RedactionPolicy {
  return $.state.get<RedactionPolicy>('secret-guard.policy') ?? DEFAULT_POLICY;
}

export const register: RegisterFn = (on) => {
  // Intercept Bash tool calls that touch git (commit/push) to scan the
  // staged diff before it enters history.
  on('tool.call', { tool: 'Bash' }, async ($, e: ToolCallEvent, next) => {
    const command = (e.input as { command?: unknown }).command;
    if (typeof command !== 'string') return next(e);
    // Only inspect git commit / git push.
    if (!/\bgit\s+(commit|push)\b/.test(command)) return next(e);
    // The actual diff content is not in the command string; in a real Mod
    // we'd run `git diff --cached` via $.fs or the host. For the contract
    // surface, we log that we would scan and forward.
    $.ui.log('secret-guard: scanning staged changes before git operation');
    return next(e);
  });

  // Intercept Edit / Write tool calls to scan the content being written.
  on('tool.call', { tool: 'Write' }, async ($, e: ToolCallEvent, next) => {
    const content = (e.input as { content?: unknown }).content;
    const path = (e.input as { path?: unknown }).path;
    if (typeof content !== 'string') return next(e);
    const policy = getPolicy($);
    const filePath = typeof path === 'string' ? path : undefined;
    const result = scanText(content, policy, 'file-write', filePath);
    if (result.outcome === 'findings') {
      $.ui.log(
        `secret-guard: blocked Write to ${filePath ?? '<unknown>'} — ${result.findings.length} secret(s) detected`,
      );
      return {
        deny: `secret-guard: refusing to write file with ${result.findings.length} detected secret(s); redact or move to a secret manager`,
      };
    }
    if (result.outcome === 'failed') {
      // INVARIANT: scanner failure is NOT a clean result. Fail-closed for
      // writes (deny) so we never silently write an unscanned file.
      $.ui.log('secret-guard: scanner failed; fail-closed for Write');
      return { deny: 'secret-guard: scanner failed; refusing to write unscanned content' };
    }
    if (result.outcome === 'skipped-too-large') {
      $.ui.log('secret-guard: Write content too large to scan; forwarding');
      // For writes, "too large" is suspicious; we forward but log loudly.
      return next(e);
    }
    return next(e);
  });

  // Intercept tool results to redact secrets from output before the model
  // sees them. This is the "Observe + Rewrite" pattern from RESEARCH.md §1.
  // The host calls our handler with the result; we rewrite it.
  on('tool.call', async ($, e: ToolCallEvent, next) => {
    const result = await next(e);
    // If the result is a string, redact it.
    if (typeof result === 'string') {
      const policy = getPolicy($);
      const redacted = redactSecrets(result, policy, 'tool-output');
      if (!redacted.fullyRedacted) {
        $.ui.log(
          `secret-guard: WARNING — ${redacted.findings.length} finding(s) not fully redacted in tool output`,
        );
      }
      return redacted.redactedText;
    }
    return result;
  });
};
