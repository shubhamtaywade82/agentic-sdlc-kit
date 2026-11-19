// packages/core/src/artifacts/writer.ts
//
// Writes JSON and Markdown artifacts to .ai-kit/ and docs/.
//
// INVARIANT (SECURITY.md §2): writes are confined to .ai-kit/ and docs/.
// Any write outside those roots requires approval (M10) and is rejected
// in M1 with ARTIFACT_WRITE_DENIED.
//
// This is a thin wrapper around the Node.js fs/promises API. The wrapper
// exists so the path-escape invariant is enforced in one place, and so
// tests can exercise it without monkey-patching fs.

import { promises as fs } from "node:fs";
import path from "node:path";
import { Errors, type Result } from "@agentic-sdlc-kit/contracts";

const ALLOWED_ROOTS = [".ai-kit", "docs"] as const;

/**
 * Resolve a target path against a project root and refuse anything that
 * escapes the allowed roots.
 */
export function resolveArtifactPath(
  projectRoot: string,
  root: (typeof ALLOWED_ROOTS)[number],
  relativePath: string,
): Result<string> {
  if (!ALLOWED_ROOTS.includes(root)) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied(`unknown artifact root: ${root}`, { root }),
    };
  }
  // Reject any relative segment that tries to escape.
  const cleaned = relativePath.replace(/^\.?\/+/, "");
  if (cleaned.includes("..")) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied("relative path contains '..'", {
        root,
        relativePath,
      }),
    };
  }
  const base = path.resolve(projectRoot, root);
  const target = path.resolve(base, cleaned);
  // Final defense: the resolved target must start with the base.
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied("resolved path escapes artifact root", {
        root,
        base,
        target,
      }),
    };
  }
  return { ok: true, value: target };
}

/**
 * Write a JSON artifact. Validates the path is inside an allowed root,
 * creates parent directories, then writes.
 */
export async function writeJson(
  projectRoot: string,
  root: (typeof ALLOWED_ROOTS)[number],
  relativePath: string,
  data: unknown,
): Promise<Result<string>> {
  const target = resolveArtifactPath(projectRoot, root, relativePath);
  if (!target.ok) return target;
  try {
    await fs.mkdir(path.dirname(target.value), { recursive: true });
    await fs.writeFile(target.value, JSON.stringify(data, null, 2) + "\n", "utf8");
    return { ok: true, value: target.value };
  } catch (e) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied(`failed to write ${relativePath}`, {
        root,
        relativePath,
        cause: e instanceof Error ? e.message : String(e),
      }),
    };
  }
}

/**
 * Write a Markdown artifact. Same invariants as writeJson.
 */
export async function writeMarkdown(
  projectRoot: string,
  root: (typeof ALLOWED_ROOTS)[number],
  relativePath: string,
  content: string,
): Promise<Result<string>> {
  const target = resolveArtifactPath(projectRoot, root, relativePath);
  if (!target.ok) return target;
  try {
    await fs.mkdir(path.dirname(target.value), { recursive: true });
    await fs.writeFile(target.value, content, "utf8");
    return { ok: true, value: target.value };
  } catch (e) {
    return {
      ok: false,
      error: Errors.artifactWriteDenied(`failed to write ${relativePath}`, {
        root,
        relativePath,
        cause: e instanceof Error ? e.message : String(e),
      }),
    };
  }
}
