// packages/cli/src/application/agent/providers/claude-code/resume-store.ts
//
// Encrypted resume-session store (ADR-0019 PR4 — the cross-process resume
// item PR3 deferred; ADR-0020 §6.8).
//
// RESUME TOKENS ARE CREDENTIALS: they are never logged, never included in
// events, and NEVER PERSISTED UNENCRYPTED. This store keeps, per execution,
// the Claude Code session id together with the resume token the provider
// issued — encrypted at rest with AES-256-GCM under a per-project key file
// (mode 0600 in a 0700 directory). A second process (the next
// `kit feature <id> run` invocation) can therefore resume a provider
// session WITHOUT the token ever existing in plaintext on disk.
//
// Honest threat model (documented, not hidden): the key lives on the same
// machine as the ciphertext, so the store protects against (a) plaintext
// leakage through the state directory (commits, copies, backups, other
// users' reads) and (b) accidental exposure of "just a JSON file" — it does
// NOT protect against a compromised same-user process on the same machine;
// that class can simply read the key. An OS keychain would narrow that
// further and remains open as a follow-up; the kit stays zero-dependency
// (ADR-0007) and this store never weakens the existing in-memory contract:
// the GATEWAY still holds tokens in memory only.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executionStoreDir, validateExecutionId } from '../../execution-store.js';

export interface StoredSessionRecord {
  readonly executionId: string;
  readonly providerId: string;
  readonly sessionId: string;
  /** The credential itself — only ever present in memory or encrypted on disk. */
  readonly resumeToken: string;
  readonly createdAt: string;
}

interface Envelope {
  readonly v: 1;
  readonly iv: string;
  readonly tag: string;
  readonly ct: string;
}

function keyPath(projectRoot: string): string {
  return path.resolve(projectRoot, '.ai-kit', 'keys', 'agent-session.key');
}

function recordPath(projectRoot: string, executionId: string): string {
  return path.join(executionStoreDir(projectRoot), `${executionId}.session.enc`);
}

async function loadOrCreateKey(projectRoot: string): Promise<Buffer> {
  const target = keyPath(projectRoot);
  try {
    const existing = await fs.readFile(target);
    if (existing.length === 32) return existing;
    // A wrong-length key file is a corrupted security boundary: fail closed.
    throw new Error(
      `agent-session key at ${target} is malformed (${existing.length} bytes, expected 32)`,
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const fresh = randomBytes(32);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, fresh, { mode: 0o600 });
    return fresh;
  }
}

function encrypt(key: Buffer, plaintext: string): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

function decrypt(key: Buffer, env: Envelope): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** Persist a session record, encrypted at rest. Refuses invalid execution ids (path traversal). */
export async function saveSessionRecord(
  projectRoot: string,
  record: StoredSessionRecord,
): Promise<void> {
  if (!validateExecutionId(record.executionId)) {
    throw new Error(`invalid execution id '${record.executionId}' — refusing to store session record`);
  }
  const key = await loadOrCreateKey(projectRoot);
  const envelope = encrypt(key, JSON.stringify(record));
  const dir = executionStoreDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  const target = recordPath(projectRoot, record.executionId);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(envelope) + '\n', { mode: 0o600 });
  await fs.rename(tmp, target);
}

/**
 * Load a session record. Returns undefined when absent. Fails closed (throws)
 * on tampering — AES-GCM auth failure means the ciphertext or key changed,
 * and a resumed session under an unverified record is unacceptable.
 */
export async function loadSessionRecord(
  projectRoot: string,
  executionId: string,
): Promise<StoredSessionRecord | undefined> {
  if (!validateExecutionId(executionId)) return undefined;
  let raw: string;
  try {
    raw = await fs.readFile(recordPath(projectRoot, executionId), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
  const key = await loadOrCreateKey(projectRoot);
  const env = JSON.parse(raw) as Envelope;
  const record = JSON.parse(decrypt(key, env)) as StoredSessionRecord;
  if (record.executionId !== executionId) {
    throw new Error(
      `session record for '${executionId}' carries a mismatched execution id — refusing`,
    );
  }
  return record;
}

/**
 * Constant-time token verification. Hash both sides first so a length
 * difference does not leak through timingSafeEqual's equal-length
 * requirement; a missing token still hashes (fail closed, no early exit).
 */
export function verifyResumeToken(record: StoredSessionRecord, presented: string): boolean {
  const a = createHash('sha256').update(record.resumeToken, 'utf8').digest();
  const b = createHash('sha256').update(typeof presented === 'string' ? presented : '', 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Generate an opaque resume credential (256 bits, url-safe). */
export function generateResumeToken(): string {
  return randomBytes(32).toString('base64url');
}
