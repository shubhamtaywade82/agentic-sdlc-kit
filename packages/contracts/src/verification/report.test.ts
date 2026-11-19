// packages/contracts/src/verification/report.test.ts
import { describe, expect, it } from 'vitest';
import { CheckSchema, VerificationReportSchema, rollupReportStatus, type Check } from './report.js';

const baseCheck = (overrides: Partial<Check> = {}): Check => ({
  id: 'unit-tests',
  status: 'passed',
  ...overrides,
});

describe('CheckSchema', () => {
  it('accepts a minimal check', () => {
    expect(CheckSchema.safeParse({ id: 'x', status: 'passed' }).success).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(CheckSchema.safeParse({ id: 'x', status: 'ok' }).success).toBe(false);
  });
});

describe('VerificationReportSchema', () => {
  it('accepts a valid report', () => {
    const r = VerificationReportSchema.safeParse({
      schemaVersion: 1,
      runId: 'RUN-001',
      status: 'passed',
      checks: [{ id: 'unit-tests', status: 'passed' }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an invalid commitSha', () => {
    const r = VerificationReportSchema.safeParse({
      schemaVersion: 1,
      runId: 'RUN-001',
      status: 'passed',
      checks: [],
      commitSha: 'not-a-sha',
    });
    expect(r.success).toBe(false);
  });
});

describe('rollupReportStatus', () => {
  it("returns 'passed' when all checks passed", () => {
    expect(rollupReportStatus([baseCheck(), baseCheck({ id: 'x', status: 'passed' })])).toBe(
      'passed',
    );
  });
  it("returns 'failed' when any check failed", () => {
    expect(
      rollupReportStatus([
        baseCheck({ status: 'passed' }),
        baseCheck({ id: 'x', status: 'failed' }),
      ]),
    ).toBe('failed');
  });
  it("returns 'blocked' when any check is blocked and none failed", () => {
    expect(
      rollupReportStatus([
        baseCheck({ status: 'passed' }),
        baseCheck({ id: 'x', status: 'blocked' }),
      ]),
    ).toBe('blocked');
  });
  it("returns 'blocked' when ALL checks are skipped (never 'passed')", () => {
    expect(
      rollupReportStatus([
        baseCheck({ status: 'skipped' }),
        baseCheck({ id: 'x', status: 'skipped' }),
      ]),
    ).toBe('blocked');
  });
  it("returns 'passed' when checks are passed + skipped (no failed, no blocked)", () => {
    expect(
      rollupReportStatus([
        baseCheck({ status: 'passed' }),
        baseCheck({ id: 'x', status: 'skipped' }),
      ]),
    ).toBe('passed');
  });
  it("returns 'blocked' when there are no checks", () => {
    expect(rollupReportStatus([])).toBe('blocked');
  });
  it("prioritizes 'failed' over 'blocked'", () => {
    expect(
      rollupReportStatus([
        baseCheck({ status: 'failed' }),
        baseCheck({ id: 'x', status: 'blocked' }),
      ]),
    ).toBe('failed');
  });
});
