// packages/contracts/src/common/errors.test.ts
import { describe, expect, it } from 'vitest';
import { Errors, type KitErrorCode } from './errors.js';

describe('Errors factory', () => {
  const cases: ReadonlyArray<{
    code: KitErrorCode;
    factory: (m: string) => ReturnType<typeof Errors.internal>;
  }> = [
    { code: 'CONTRACT_INVALID', factory: (m) => Errors.contractInvalid(m) },
    { code: 'PROFILE_INVALID', factory: (m) => Errors.profileInvalid(m) },
    { code: 'PLAN_INVALID', factory: (m) => Errors.planInvalid(m) },
    { code: 'SPEC_INVALID', factory: (m) => Errors.specInvalid(m) },
    { code: 'VERIFICATION_FAILED', factory: (m) => Errors.verificationFailed(m) },
    { code: 'APPROVAL_DENIED', factory: (m) => Errors.approvalDenied(m) },
    { code: 'APPROVAL_REQUIRED', factory: (m) => Errors.approvalRequired(m) },
    { code: 'POLICY_VIOLATION', factory: (m) => Errors.policyViolation(m) },
    { code: 'DISCOVERY_FAILED', factory: (m) => Errors.discoveryFailed(m) },
    { code: 'ARTIFACT_WRITE_DENIED', factory: (m) => Errors.artifactWriteDenied(m) },
    { code: 'ARTIFACT_READ_DENIED', factory: (m) => Errors.artifactReadDenied(m) },
    { code: 'TIMEOUT', factory: (m) => Errors.timeout(m) },
    { code: 'NOT_IMPLEMENTED', factory: (m) => Errors.notImplemented(m) },
    { code: 'AGENT_PROVIDER_NOT_CONFIGURED', factory: (m) => Errors.agentProviderNotConfigured(m) },
    { code: 'INTERNAL', factory: (m) => Errors.internal(m) },
  ];

  for (const { code, factory } of cases) {
    it(`constructs ${code} with message and details`, () => {
      const e = factory('hello');
      expect(e.code).toBe(code);
      expect(e.message).toBe('hello');
      expect(e.details).toBeUndefined();
    });
  }

  it('attaches details when provided', () => {
    const e = Errors.profileInvalid('bad', { field: 'stack' });
    expect(e.details).toEqual({ field: 'stack' });
  });

  it('attaches cause when provided', () => {
    const cause = new Error('root');
    const e = Errors.internal('wrapped', undefined, cause);
    expect(e.cause).toBe(cause);
  });
});
