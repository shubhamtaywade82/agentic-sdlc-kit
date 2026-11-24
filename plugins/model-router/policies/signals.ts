// plugins/model-router/policies/signals.ts
//
// Deterministic text signals for routing a subagent spawn (pure; no LLM).
//
// Only POSITIVE evidence changes the baseline. Text with no recognised signal
// returns null, so the router keeps its explicit baseline instead of guessing.
// A task is "low" only when a trivial keyword is present AND nothing contrary
// is: a missed signal must never route a risky task to a lightweight model.

import type { ClassifyInput } from './classifier';

export interface TextClassification {
  input: ClassifyInput;
  /** Human-readable reasons, e.g. `destructive "drop"`; logged with the decision. */
  evidence: string[];
}

/** Whole-word, case-insensitive: `drop` matches "drop the table", not "dropdown". */
function word(alternatives: readonly string[]): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])(?:${alternatives.join('|')})(?![A-Za-z0-9])`, 'i');
}

const DESTRUCTIVE = word(['delete', 'drop', 'truncate', 'purge', 'wipe', 'destroy', 'force[- ]push', 'reset\\s+--hard', 'rm -rf']);
const PRODUCTION = word(['prod', 'production', 'deploy', 'deployment', 'release']);
const SECURITY = word([
  'auth', 'authentication', 'authorization', 'oauth', 'jwt', 'tokens?', 'secrets?',
  'credentials?', 'passwords?', 'crypto', 'encrypt', 'encryption', 'security',
  'vulnerability', 'permissions?',
]);
const HIGH_COMPLEXITY = word(['architecture', 'redesign', 'rewrite', 'overhaul', 'cross-cutting', 'distributed', 'across modules', 'multi-module']);
const LOW_KEYWORD = word(['typo', 'rename', 'format', 'formatting', 'lint', 'comments?', 'docs', 'documentation', 'readme', 'changelog']);

/** Above this a description is too open-ended to call trivial. */
const MAX_TRIVIAL_LENGTH = 200;

// estimatedFileCount buckets understood by classifyComplexity (>10 high, >3 medium).
const FILES_HIGH = 11;
const FILES_MEDIUM = 4;
const FILES_TRIVIAL = 1;

function matchOf(re: RegExp, text: string): string | undefined {
  return re.exec(text)?.[0];
}

export function classifyText(text: string): TextClassification | null {
  const hits = {
    destructive: matchOf(DESTRUCTIVE, text),
    production: matchOf(PRODUCTION, text),
    security: matchOf(SECURITY, text),
    high: matchOf(HIGH_COMPLEXITY, text),
    low: matchOf(LOW_KEYWORD, text),
  };
  const evidence = Object.entries(hits)
    .filter(([, m]) => m !== undefined)
    .map(([kind, m]) => `${kind} "${m}"`);
  if (evidence.length === 0) return null;

  const contrary = hits.destructive || hits.production || hits.security || hits.high;
  const trivial = hits.low !== undefined && !contrary && text.length <= MAX_TRIVIAL_LENGTH;
  return {
    input: {
      prompt: text,
      touchesProduction: hits.production !== undefined,
      destructive: hits.destructive !== undefined,
      securitySensitive: hits.security !== undefined,
      estimatedFileCount: hits.high ? FILES_HIGH : trivial ? FILES_TRIVIAL : FILES_MEDIUM,
    },
    evidence,
  };
}
