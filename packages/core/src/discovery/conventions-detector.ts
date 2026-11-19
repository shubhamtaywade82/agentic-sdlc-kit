// packages/core/src/discovery/conventions-detector.ts
//
// Read-only inspection of repository structure, entry points,
// migrations, CI pipelines, and agent instruction files.

import { promises as fs } from "node:fs";
import path from "node:path";

const CANDIDATE_ENTRY_POINTS = [
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/main.js",
  "src/app.ts",
  "src/app.js",
  "index.ts",
  "index.js",
  "main.go",
  "src/main.rs",
] as const;

const CANDIDATE_MIGRATIONS = [
  "db/migrate",
  "migrations",
  "prisma/migrations",
  "db/migrations",
] as const;

const CANDIDATE_CI = [
  ".github/workflows",
  ".gitlab-ci.yml",
  ".circleci",
] as const;

const CANDIDATE_AGENT_INSTRUCTIONS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".cursor/rules",
  ".windsurfrules",
  ".windsurf/rules",
  ".github/copilot-instructions.md",
] as const;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function detectEntryPoints(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const rel of CANDIDATE_ENTRY_POINTS) {
    if (await pathExists(path.join(root, rel))) found.push(rel);
  }
  return found;
}

export async function detectMigrations(root: string): Promise<boolean> {
  for (const rel of CANDIDATE_MIGRATIONS) {
    if (await pathExists(path.join(root, rel))) return true;
  }
  return false;
}

export async function detectCi(root: string): Promise<boolean> {
  for (const rel of CANDIDATE_CI) {
    if (await pathExists(path.join(root, rel))) return true;
  }
  return false;
}

export async function detectAgentInstructions(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const rel of CANDIDATE_AGENT_INSTRUCTIONS) {
    if (await pathExists(path.join(root, rel))) found.push(rel);
  }
  return found;
}
