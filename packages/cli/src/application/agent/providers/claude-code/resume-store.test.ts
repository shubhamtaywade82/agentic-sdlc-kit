// packages/cli/src/application/agent/providers/claude-code/resume-store.test.ts
//
// ADR-0020 §6.8: resume tokens are credentials. These tests prove the
// cross-process resume store (PR4) keeps that contract:
//   - the token is NEVER present in plaintext in the persisted file;
//   - the ciphertext fails closed on tampering (AES-256-GCM auth);
//   - key + record files carry restrictive permissions;
//   - token verification is constant-time and rejects wrong tokens;
//   - path traversal via executionId is refused.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  generateResumeToken,
  loadSessionRecord,
  saveSessionRecord,
  verifyResumeToken,
} from './resume-store.js';

let projectRoot: string;

beforeAll(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-resume-store-'));
});

afterAll(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

const EXECUTION_ID = 'exec-RUN-001-TASK-001-red-1';

describe('encrypted resume store', () => {
  it('round-trips a session record', async () => {
    const token = generateResumeToken();
    await saveSessionRecord(projectRoot, {
      executionId: EXECUTION_ID,
      providerId: 'claude-code',
      sessionId: 'sess-abc',
      resumeToken: token,
      createdAt: new Date().toISOString(),
    });
    const loaded = await loadSessionRecord(projectRoot, EXECUTION_ID);
    expect(loaded?.sessionId).toBe('sess-abc');
    expect(loaded?.resumeToken).toBe(token);
  });

  it('never writes the token in plaintext (the file does not contain it)', async () => {
    const token = generateResumeToken();
    await saveSessionRecord(projectRoot, {
      executionId: 'exec-RUN-002-TASK-001-red-1',
      providerId: 'claude-code',
      sessionId: 'sess-plain',
      resumeToken: token,
      createdAt: new Date().toISOString(),
    });
    const raw = await fs.readFile(
      path.join(projectRoot, '.ai-kit', 'state', 'agent-executions', 'exec-RUN-002-TASK-001-red-1.session.enc'),
      'utf8',
    );
    expect(raw).not.toContain(token);
    expect(raw).not.toContain('sess-plain');
    // Envelope shape only: v, iv, tag, ct — all base64 ciphertext parts.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['ct', 'iv', 'tag', 'v']);
  });

  it('fails closed on ciphertext tampering', async () => {
    const token = generateResumeToken();
    await saveSessionRecord(projectRoot, {
      executionId: 'exec-RUN-003-TASK-001-red-1',
      providerId: 'claude-code',
      sessionId: 'sess-tamper',
      resumeToken: token,
      createdAt: new Date().toISOString(),
    });
    const target = path.join(
      projectRoot,
      '.ai-kit',
      'state',
      'agent-executions',
      'exec-RUN-003-TASK-001-red-1.session.enc',
    );
    const envelope = JSON.parse(await fs.readFile(target, 'utf8')) as { ct: string };
    const bytes = Buffer.from(envelope.ct, 'base64');
    bytes[0] ^= 0xff; // flip one bit
    await fs.writeFile(target, JSON.stringify({ ...envelope, ct: bytes.toString('base64') }));
    await expect(loadSessionRecord(projectRoot, 'exec-RUN-003-TASK-001-red-1')).rejects.toThrow();
  });

  it('creates the key with restrictive permissions and reuses it', async () => {
    const keyFile = path.join(projectRoot, '.ai-kit', 'keys', 'agent-session.key');
    const stat = await fs.stat(keyFile);
    expect(stat.mode & 0o777).toBe(0o600);
    const before = await fs.readFile(keyFile);
    await saveSessionRecord(projectRoot, {
      executionId: 'exec-RUN-004-TASK-001-red-1',
      providerId: 'claude-code',
      sessionId: 'sess-key',
      resumeToken: generateResumeToken(),
      createdAt: new Date().toISOString(),
    });
    const after = await fs.readFile(keyFile);
    expect(before.equals(after)).toBe(true); // key is stable across saves
  });

  it('stores records with mode 0600', async () => {
    const stat = await fs.stat(
      path.join(
        projectRoot,
        '.ai-kit',
        'state',
        'agent-executions',
        'exec-RUN-001-TASK-001-red-1.session.enc',
      ),
    );
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('refuses invalid execution ids (path traversal)', async () => {
    await expect(
      saveSessionRecord(projectRoot, {
        executionId: '../../escape',
        providerId: 'claude-code',
        sessionId: 'sess-x',
        resumeToken: 't',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/invalid execution id/);
    await expect(loadSessionRecord(projectRoot, '../../escape')).resolves.toBeUndefined();
  });

  it('returns undefined for a missing record', async () => {
    await expect(loadSessionRecord(projectRoot, 'exec-RUN-999-TASK-001-red-1')).resolves.toBeUndefined();
  });
});

describe('verifyResumeToken', () => {
  it('accepts the matching token and rejects everything else', () => {
    const record = {
      executionId: EXECUTION_ID,
      providerId: 'claude-code',
      sessionId: 's',
      resumeToken: generateResumeToken(),
      createdAt: new Date().toISOString(),
    };
    expect(verifyResumeToken(record, record.resumeToken)).toBe(true);
    expect(verifyResumeToken(record, generateResumeToken())).toBe(false);
    expect(verifyResumeToken(record, '')).toBe(false);
    expect(verifyResumeToken(record, record.resumeToken.slice(0, 10))).toBe(false);
  });

  it('generates opaque url-safe 256-bit credentials', () => {
    const tokens = new Set(Array.from({ length: 32 }, () => generateResumeToken()));
    expect(tokens.size).toBe(32);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    }
  });
});
