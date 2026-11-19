// packages/core/src/secret-guard/detector.ts
//
// Secret detector (M11 baseline). Pure functions; no Gitleaks dependency.
//
// Applies the built-in detection rules from
// packages/contracts/src/secret-guard/detection-rule.ts to input text and
// returns a list of SecretFinding values (with redacted previews; never
// the full secret value).
//
// This is the baseline detector. The M11 Mod (when it lands) wraps this
// and adds Gitleaks as an optional extended scanner.

import {
  BUILTIN_DETECTION_RULES,
  type DetectionRule,
  type SecretFinding,
  type SecretKind,
  redactedPreview,
  type SecretSeverity,
} from '@agentic-sdlc-kit/contracts';

interface CompiledRule {
  rule: DetectionRule;
  pattern: RegExp;
}

function compileRule(rule: DetectionRule): CompiledRule {
  // Patterns are ECMAScript regex sources; apply with global flag.
  // If a rule has a capture group (e.g., AWS secret), we want the first
  // captured group as the secret value; otherwise the whole match.
  const pattern = new RegExp(rule.pattern, 'g');
  return { rule, pattern };
}

const COMPILED_BUILTINS: ReadonlyArray<CompiledRule> = BUILTIN_DETECTION_RULES.filter(
  (r) => r.enabled,
).map(compileRule);

/**
 * Detect secrets in a string of text. Returns findings with redacted
 * previews; never the full secret value.
 *
 * `source` and `filePath` are passed through to the findings for
 * traceability.
 */
export function detectSecrets(
  text: string,
  source: SecretFinding['location']['source'],
  filePath?: string,
  rules: ReadonlyArray<DetectionRule> = COMPILED_BUILTINS.map((c) => c.rule),
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const compiled =
    rules === COMPILED_BUILTINS.map((c) => c.rule) ? COMPILED_BUILTINS : rules.map(compileRule);
  for (const { rule, pattern } of compiled) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      // If the rule has a capture group, use the first captured group as
      // the secret value; otherwise the whole match.
      const value = m[1] ?? m[0];
      if (!value) continue;
      const offset = m.index + m[0].indexOf(value);
      // Compute 1-indexed line and column.
      const upTo = text.slice(0, offset);
      const lines = upTo.split('\n');
      const line = lines.length;
      const column = (lines[lines.length - 1]?.length ?? 0) + 1;
      findings.push({
        id: `F-${findings.length + 1}`,
        kind: rule.kind as SecretKind,
        location: {
          ...(filePath !== undefined ? { filePath } : {}),
          line,
          column,
          offset,
          length: value.length,
          source,
        },
        detector: 'builtin',
        // Without a checksum validator, confidence is "medium".
        // With a validator that's not registered, also "medium".
        confidence: rule.checksumValidator ? 'medium' : 'medium',
        severity: rule.severity as SecretSeverity,
        redactedPreview: redactedPreview(value),
        redacted: false,
      });
      // Avoid infinite loop on zero-length matches.
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return findings;
}
