// packages/contracts/src/common/errors.ts
//
// Structured error type used by every Result<T, KitError>. The `code`
// field is the contract the caller switches on; the `message` is for
// humans; `details` is structured context for logs and reports.
//
// See docs/contracts/CONTRACTS.md §1.1.

export type KitErrorCode =
  | 'CONTRACT_INVALID'
  | 'PROFILE_INVALID'
  | 'PLAN_INVALID'
  | 'SPEC_INVALID'
  | 'VERIFICATION_FAILED'
  | 'APPROVAL_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'POLICY_VIOLATION'
  | 'DISCOVERY_FAILED'
  | 'ARTIFACT_WRITE_DENIED'
  | 'ARTIFACT_READ_DENIED'
  | 'TIMEOUT'
  | 'NOT_IMPLEMENTED'
  | 'AGENT_PROVIDER_NOT_CONFIGURED'
  | 'INTERNAL';

export interface KitError {
  readonly code: KitErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export const kitError = (
  code: KitErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): KitError => ({
  code,
  message,
  ...(details !== undefined ? { details } : {}),
  ...(cause !== undefined ? { cause } : {}),
});

/**
 * Convenience constructors for the most common error codes. Keeping these
 * in one place makes it easy to audit every site that produces a given code.
 *
 * Each factory accepts an optional `details` and an optional `cause`. The
 * `cause` is attached when the error wraps another error (e.g., a caught
 * exception); `details` carries structured context for logs and reports.
 */
export const Errors = {
  contractInvalid: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('CONTRACT_INVALID', message, details, cause),
  profileInvalid: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('PROFILE_INVALID', message, details, cause),
  planInvalid: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('PLAN_INVALID', message, details, cause),
  specInvalid: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('SPEC_INVALID', message, details, cause),
  verificationFailed: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('VERIFICATION_FAILED', message, details, cause),
  approvalDenied: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('APPROVAL_DENIED', message, details, cause),
  approvalRequired: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('APPROVAL_REQUIRED', message, details, cause),
  policyViolation: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('POLICY_VIOLATION', message, details, cause),
  discoveryFailed: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('DISCOVERY_FAILED', message, details, cause),
  artifactWriteDenied: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('ARTIFACT_WRITE_DENIED', message, details, cause),
  artifactReadDenied: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('ARTIFACT_READ_DENIED', message, details, cause),
  timeout: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('TIMEOUT', message, details, cause),
  notImplemented: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('NOT_IMPLEMENTED', message, details, cause),
  /**
   * Mode 1 (kit-orchestrated) execution was requested but no agent
   * provider is configured/registered (ADR-0019 §1). The CLI maps this to
   * exit code 3 (blocked / prerequisite missing) and NEVER falls back to
   * pretending a manual workflow completed.
   */
  agentProviderNotConfigured: (
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): KitError => kitError('AGENT_PROVIDER_NOT_CONFIGURED', message, details, cause),
  internal: (message: string, details?: Record<string, unknown>, cause?: unknown): KitError =>
    kitError('INTERNAL', message, details, cause),
} as const;
