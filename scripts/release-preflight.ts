// scripts/release-preflight.ts
//
// Gate that runs before `pnpm publish`. Every check fails closed:
//   1. A release tag must name the kit line, and a publishable
//      @agentic-sdlc-kit package must match it. Packages on their own version
//      line (@agentic-mods) are not compared with the tag.
//   2. Every publishable package version must be absent from the npm registry.
//      A re-run of a half-finished publish therefore stops before any write.
//   3. Every registry question needs a definite answer. Only npm's E404 means
//      "not published"; a network or auth failure never does.
//
// The planner and the reply parser are pure and covered by
// release-preflight.test.ts. The CLI reads packages/*/package.json and calls
// npm with an argument array, never through a shell.

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PublishableManifest {
  readonly name: string;
  readonly version: string;
  readonly private: boolean;
}

export type RegistryLookup =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present'; readonly version: string }
  | { readonly kind: 'error'; readonly message: string };

export interface PreflightInput {
  readonly tag: string | undefined;
  readonly manifests: readonly PublishableManifest[];
  readonly registry: ReadonlyMap<string, RegistryLookup>;
}

export type PreflightResult =
  | { readonly ok: true; readonly plan: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface NpmReply {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const KIT_SCOPE = '@agentic-sdlc-kit/';
const RELEASE_TAG = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function planReleasePreflight(input: PreflightInput): PreflightResult {
  const publishable = input.manifests.filter((m) => !m.private);
  if (publishable.length === 0) {
    return { ok: false, errors: ['no publishable packages found under packages/*'] };
  }
  const errors = [
    ...tagErrors(input.tag, publishable),
    ...publishable.flatMap((m) => registryErrors(m, input.registry)),
  ];
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: publishable.map((m) => `${m.name}@${m.version}`) };
}

function tagErrors(tag: string | undefined, publishable: readonly PublishableManifest[]): string[] {
  if (tag === undefined) return [];
  const match = RELEASE_TAG.exec(tag);
  if (match === null) return [`release tag ${JSON.stringify(tag)} is not vMAJOR.MINOR.PATCH[-prerelease]`];
  const kit = publishable.filter((m) => m.name.startsWith(KIT_SCOPE));
  if (kit.length === 0) {
    return [`release tag ${tag} has no publishable ${KIT_SCOPE}* package to match`];
  }
  const expected = match[1] ?? '';
  return kit
    .filter((m) => m.version !== expected)
    .map((m) => `${m.name} is ${m.version} but release tag ${tag} expects ${expected}`);
}

function registryErrors(m: PublishableManifest, registry: ReadonlyMap<string, RegistryLookup>): string[] {
  const key = `${m.name}@${m.version}`;
  const answer = registry.get(key);
  if (answer === undefined) return [`${key}: no registry answer (fail closed)`];
  if (answer.kind === 'present') return [`${key} is already published; bump the version before releasing`];
  if (answer.kind === 'error') return [`${key}: could not verify against the registry (${answer.message})`];
  return [];
}

/** Classifies one `npm view name@version version --json` reply. */
export function parseRegistryLookup(reply: NpmReply, version: string): RegistryLookup {
  if (reply.exitCode !== 0) {
    const code = errorCode(reply.stdout);
    if (code === 'E404') return { kind: 'absent' };
    return { kind: 'error', message: code ?? firstLine(reply.stderr) ?? `npm exited ${reply.exitCode}` };
  }
  const answered = versionAnswer(reply.stdout);
  if (answered === undefined) {
    return { kind: 'error', message: 'empty or malformed registry reply' };
  }
  return answered === version
    ? { kind: 'present', version }
    : { kind: 'error', message: `registry answered ${answered}, expected ${version}` };
}

function errorCode(stdout: string): string | undefined {
  const body: unknown = parseJson(stdout);
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const error = body.error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function versionAnswer(stdout: string): string | undefined {
  const body: unknown = parseJson(stdout);
  return typeof body === 'string' ? body : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function firstLine(text: string): string | undefined {
  return text.split('\n').map((l) => l.trim()).find((l) => l !== '');
}

async function readManifests(root: string): Promise<PublishableManifest[]> {
  const packagesDir = join(root, 'packages');
  const out: PublishableManifest[] = [];
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(packagesDir, entry.name, 'package.json');
    const raw = await readFileIfPresent(path);
    if (raw === null) continue;
    const pkg = JSON.parse(raw) as { name?: unknown; version?: unknown; private?: unknown };
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
      throw new Error(`${path} has no string name and version`);
    }
    out.push({ name: pkg.name, version: pkg.version, private: pkg.private === true });
  }
  return out;
}

// Only a missing file is skipped. An unreadable manifest must stop the run.
async function readFileIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function npmView(name: string, version: string): Promise<NpmReply> {
  return new Promise((resolve) => {
    execFile('npm', ['view', `${name}@${version}`, 'version', '--json'], { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err === null) {
        resolve({ exitCode: 0, stdout, stderr });
        return;
      }
      const exitCode = typeof err.code === 'number' ? err.code : 1;
      resolve({ exitCode, stdout, stderr: stderr !== '' ? stderr : err.message });
    });
  });
}

export async function runPreflight(root: string, tag: string | undefined): Promise<PreflightResult> {
  const manifests = await readManifests(root);
  const registry = new Map<string, RegistryLookup>();
  for (const m of manifests.filter((x) => !x.private)) {
    registry.set(`${m.name}@${m.version}`, parseRegistryLookup(await npmView(m.name, m.version), m.version));
  }
  return planReleasePreflight({ tag, manifests, registry });
}

const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  const tagValue = (process.env.RELEASE_TAG ?? '').trim();
  try {
    const result = await runPreflight(process.cwd(), tagValue === '' ? undefined : tagValue);
    if (result.ok) {
      for (const entry of result.plan) console.log(`preflight ok: ${entry}`);
      process.exit(0);
    }
    for (const error of result.errors) console.error(`::error::${error}`);
    process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`::error::release preflight failed closed: ${message}`);
    process.exit(1);
  }
}
