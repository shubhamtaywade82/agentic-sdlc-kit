// packages/contracts/src/common/identifier.test.ts
import { describe, expect, it } from 'vitest';
import { IdentifierSchema, isValidIdentifier } from './identifier.js';

describe('IdentifierSchema', () => {
  const valid = [
    'FEATURE-001',
    'TASK-014',
    'RUN-002',
    'unit-tests',
    'typecheck',
    'model-router',
    'a',
    'ab',
    'a-b',
    'a-1',
    'feature-001', // lowercase kebab with digits; valid
    'feature--', // consecutive dashes; technically valid per regex
    'node-typescript',
    'ruby-rails',
  ];
  for (const v of valid) {
    it(`accepts ${JSON.stringify(v)}`, () => {
      expect(IdentifierSchema.safeParse(v).success).toBe(true);
      expect(isValidIdentifier(v)).toBe(true);
    });
  }

  const invalid = [
    '',
    'FEATURE-1', // needs 3+ digits
    'feature-001-X', // trailing uppercase
    'Feature-001', // mixed case prefix
    'FEATURE-', // missing digits
    '-feature', // leading dash
    'FEATURE 001', // space
    'UPPERCASE', // no dash
    'x'.repeat(65), // too long
    '1starts-with-digit',
    'has_underscore',
    'has.dot',
    'has space',
    'UPPER-With-Dash',
  ];
  for (const v of invalid) {
    it(`rejects ${JSON.stringify(v)}`, () => {
      expect(IdentifierSchema.safeParse(v).success).toBe(false);
      expect(isValidIdentifier(v)).toBe(false);
    });
  }
});
