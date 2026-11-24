// packages/cli/src/commands/skills-install-secure.ts
//
// Fail-closed filesystem primitives for `kit skills install`
// (docs/security/SECURITY.md threat model: an external skills pack is
// untrusted content; a skills destination is untrusted until proven clean).
//
// Every rule here is a hard error, never a warning and never a silent skip:
//   1. `--into` must resolve inside the target project (path traversal).
//   2. No component of the destination path may be a symlink, so a planted
//      link can never redirect kit writes outside the project.
//   3. Pack content is copied without ever following symlinks; a symlink
//      anywhere in a skill directory is rejected, not skipped.
//   4. Every SKILL.md must carry YAML frontmatter whose `name` matches its
//      directory and that declares a `description` (Agent Skills format).

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Hard installer error. The message is user-facing; there is never a default. */
export class SecureInstallError extends Error {}

const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Resolve `--into` against the project root and enforce containment. */
export function resolveInstallTarget(targetRoot: string, into: string): string {
  const root = path.resolve(targetRoot);
  const target = path.resolve(root, into);
  if (target === root) {
    throw new SecureInstallError(
      `--into must name a subdirectory of the project, not the project itself: '${into}'`,
    );
  }
  if (!target.startsWith(root + path.sep)) {
    throw new SecureInstallError(
      `--into escapes the project directory: '${into}' ` +
        `(resolved to ${target}; the project is ${root})`,
    );
  }
  return target;
}

/** Reject a destination whose path traverses a symlinked component. */
export async function assertPathSymlinkFree(root: string, target: string): Promise<void> {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  let current = path.resolve(root);
  for (const part of rel.split(path.sep)) {
    if (!part || part === '.') continue;
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => null);
    if (stat?.isSymbolicLink()) {
      throw new SecureInstallError(
        `refusing to install through a symlinked path component: ${current}`,
      );
    }
  }
}

/** Skill directory names become filesystem path components: validate them. */
export function assertSafeSkillName(name: string): void {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new SecureInstallError(`unsafe skill directory name in pack: '${name}'`);
  }
}

/** Copy a directory tree, rejecting symlinks and special file types. */
export async function copyTreeSecure(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    if (entry.isSymbolicLink()) {
      throw new SecureInstallError(`symlink in pack content (nothing installed): ${from}`);
    }
    if (!entry.isFile() && !entry.isDirectory()) {
      throw new SecureInstallError(`unsupported file type in pack (nothing installed): ${from}`);
    }
    if (entry.isDirectory()) {
      await copyTreeSecure(from, path.join(dest, entry.name));
    } else {
      await fs.copyFile(from, path.join(dest, entry.name));
    }
  }
}

/** Validate a staged SKILL.md against the Agent Skills frontmatter contract. */
export async function validateSkillFrontmatter(
  skillMd: string,
  expectedName: string,
): Promise<void> {
  const raw = await fs.readFile(skillMd, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    throw new SecureInstallError(`SKILL.md has no YAML frontmatter: ${skillMd}`);
  }
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (close === -1) {
    throw new SecureInstallError(`SKILL.md frontmatter is never closed: ${skillMd}`);
  }
  const frontmatter = lines.slice(1, close);
  const nameLine = frontmatter.find((l) => l.startsWith('name:'));
  const name = nameLine?.slice('name:'.length).trim();
  const hasDescription = frontmatter.some((l) => l.startsWith('description:'));
  if (!name || !hasDescription) {
    throw new SecureInstallError(
      `SKILL.md frontmatter must declare name and description: ${skillMd}`,
    );
  }
  if (name !== expectedName) {
    throw new SecureInstallError(
      `SKILL.md name '${name}' does not match its directory '${expectedName}': ${skillMd}`,
    );
  }
}
