// packages/contracts/src/secret-guard/detection-rule.ts
//
// Detection rule contract (M11 — M11-02).
//
// A detection rule is a named pattern + optional checksum validation that
// the detector applies to input. Built-in rules cover the common cloud and
// VCS tokens; the M11 Mod adds Gitleaks as an optional extended scanner.

import { z } from 'zod';
import { SecretKindSchema } from './finding.js';

export const DetectionRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: SecretKindSchema,
  // ECMAScript regex source (string form). The detector compiles and
  // applies this with the global flag.
  pattern: z.string().min(1),
  // Optional checksum validator function name (e.g., "aws-key-checksum").
  // The detector looks up the named validator in a registry; if absent,
  // confidence is downgraded to "medium".
  checksumValidator: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  // Whether this rule is enabled by default.
  enabled: z.boolean().default(true),
});

export type DetectionRule = z.infer<typeof DetectionRuleSchema>;

/**
 * Built-in detection rules. The M11 detector ships these by default;
// additional rules can be loaded from a user configuration.
 */
export const BUILTIN_DETECTION_RULES: ReadonlyArray<DetectionRule> = [
  {
    id: 'aws-access-key',
    name: 'AWS Access Key ID',
    kind: 'aws-access-key',
    pattern: 'AKIA[0-9A-Z]{16}',
    checksumValidator: 'aws-key-checksum',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'aws-secret-key',
    name: 'AWS Secret Access Key',
    kind: 'aws-secret-key',
    // 40-char base64-ish string after an assignment with aws_secret hint.
    pattern:
      '(?:aws_secret|secretAccessKey|secret_access_key)["\']?\\s*[:=]\\s*["\']?([A-Za-z0-9/+]{40})',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'github-token',
    name: 'GitHub Personal Access Token',
    kind: 'github-token',
    pattern: 'gh[pousr]_[A-Za-z0-9]{36,}',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'gitlab-token',
    name: 'GitLab Token',
    kind: 'gitlab-token',
    pattern: 'glpat-[A-Za-z0-9_-]{20}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'google-api-key',
    name: 'Google API Key',
    kind: 'google-api-key',
    pattern: 'AIza[0-9A-Za-z_-]{35}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'stripe-key',
    name: 'Stripe Secret Key',
    kind: 'stripe-key',
    pattern: 'sk_(?:live|test)_[0-9a-zA-Z]{24,}',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'slack-token',
    name: 'Slack Token',
    kind: 'slack-token',
    pattern: 'xox[baprs]-[0-9A-Za-z-]{10,}',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'private-key-pem',
    name: 'PEM Private Key',
    kind: 'private-key-pem',
    pattern: '-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'generic-api-key',
    name: 'Generic API Key Assignment',
    kind: 'generic-api-key',
    // Heuristic: a variable name containing "key"/"token"/"secret"
    // assigned to a 32+ char string. Low confidence by design.
    // Note: ECMAScript regex does not support the (?i) inline flag, so we
    // use explicit case-insensitive character classes for the variable name.
    pattern:
      '(?:[Aa][Pp][Ii][_\\-]?[Kk][Ee][Yy]|[Aa][Uu][Tt][Hh][_\\-]?[Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt])\\s*[:=]\\s*["\']([A-Za-z0-9_+/=-]{32,})["\']',
    severity: 'medium',
    enabled: true,
  },
];
