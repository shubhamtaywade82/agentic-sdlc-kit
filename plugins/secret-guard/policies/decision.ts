// plugins/secret-guard/policies/decision.ts
//
// Pure decisions for secret-guard. A finding is reported by kind and line
// only, never by value: the hook's output goes to the model's context and the
// transcript, so echoing the secret would leak it a second time.

import { detectSecrets, type SecretFinding, type SecretSource } from './detect.js';

export type SecretDecision = { kind: 'allow' } | { kind: 'deny'; reason: string };

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** Text a file-writing tool is about to put on disk. */
export function extractWriteText(input: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  for (const key of ['content', 'new_string', 'new_source']) {
    const v = input[key];
    if (typeof v === 'string') parts.push(v);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) {
      const v = (edit as { new_string?: unknown }).new_string;
      if (typeof v === 'string') parts.push(v);
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function isWriteTool(toolName: unknown): boolean {
  return typeof toolName === 'string' && WRITE_TOOLS.has(toolName);
}

/** `git commit` anywhere in the command, including after -C/-c global options. */
export function isGitCommit(command: string): boolean {
  return /(^|[\s;&|(])git(\s+-\S+(\s+\S+)?)*\s+commit(\s|$)/.test(command);
}

/** Only lines the commit would ADD can introduce a secret. */
export function addedLines(diff: string): string {
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

export function decideText(text: string, source: SecretSource, filePath?: string): SecretDecision {
  const findings = detectSecrets(text, source, filePath);
  if (findings.length === 0) return { kind: 'allow' };
  return { kind: 'deny', reason: describe(findings, source, filePath) };
}

function describe(findings: SecretFinding[], source: SecretSource, filePath?: string): string {
  const where = filePath ? ` in ${filePath}` : '';
  const items = findings.map((f) => `${f.kind} at line ${f.location.line}`).join('; ');
  return `secret-guard: refusing ${source}${where}: ${items}. Remove the secret and reference it from the environment.`;
}
