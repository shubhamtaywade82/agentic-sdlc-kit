/**
 * `kit inspect` — best-effort project inventory: file types, manifests,
 * frameworks, test tooling, git and kit state. Always exits 0.
 */

import * as fs from "fs";
import * as path from "path";
import { IO } from "./report";
import { gitBranch, gitStatusPorcelain, isGitRepo } from "./git";
import { walkFiles } from "./audit";

const MAX_FILES = 20000;

export interface ExtensionCount {
  ext: string;
  count: number;
}

export interface InspectReport {
  status: "ok";
  root: string;
  files: { total: number; truncated: boolean; byExtension: ExtensionCount[] };
  manifests: { packageJson: boolean; gemfile: boolean; projectName: string | null; scripts: string[] };
  frameworks: string[];
  testFrameworks: string[];
  configs: { lint: string[]; typecheck: string[] };
  git: { repo: boolean; branch: string | null; dirty: number };
  kit: { profile: boolean; specifications: number; plans: number; adrs: number };
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
}

function countUnder(root: string, relDir: string): number {
  const dir = path.join(root, relDir);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const visit = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) visit(path.join(d, e.name));
      else if (e.isFile()) count++;
    }
  };
  visit(dir);
  return count;
}

const LINT_CONFIGS = [
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".rubocop.yml",
  ".stylelintrc",
  ".stylelintrc.json",
  "biome.json",
  ".oxlintrc.json",
];

const TYPECHECK_CONFIGS = ["tsconfig.json", "deno.json", "jsconfig.json"];

export function runInspect(root: string, opts: { json: boolean; io: IO }): { exitCode: number; report: InspectReport } {
  const io = opts.io;

  // --- files ---
  const allFiles = walkFiles(root);
  const truncated = allFiles.length > MAX_FILES;
  const files = truncated ? allFiles.slice(0, MAX_FILES) : allFiles;
  const extCounts = new Map<string, number>();
  for (const rel of files) {
    const base = path.posix.basename(rel.replace(/\\/g, "/"));
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "(none)";
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }
  const byExtension: ExtensionCount[] = Array.from(extCounts.entries())
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => (b.count - a.count !== 0 ? b.count - a.count : a.ext.localeCompare(b.ext)))
    .slice(0, 8);

  // --- manifests & frameworks ---
  const pkgPath = path.join(root, "package.json");
  const hasPackageJson = fs.existsSync(pkgPath);
  const hasGemfile = fs.existsSync(path.join(root, "Gemfile"));
  const pkg = hasPackageJson ? readJson(pkgPath) : null;
  const deps = new Set<string>([
    ...asStringArray(pkg !== null ? pkg.dependencies : null),
    ...asStringArray(pkg !== null ? pkg.devDependencies : null),
  ]);
  const scripts = asStringArray(pkg !== null ? pkg.scripts : null);

  const frameworks: string[] = [];
  if (hasGemfile) frameworks.push("rails");
  if (deps.has("next")) frameworks.push("next");
  if (deps.has("react")) frameworks.push("react");
  if (deps.has("vue")) frameworks.push("vue");

  const testFrameworks: string[] = [];
  const hasAny = (files: string[]): boolean => files.some((f) => fs.existsSync(path.join(root, f)));
  if (deps.has("vitest") || hasAny(["vitest.config.ts", "vitest.config.mts", "vitest.config.cts", "vitest.config.js", "vitest.config.mjs", "vitest.config.cjs"])) {
    testFrameworks.push("vitest");
  }
  if (deps.has("jest") || hasAny(["jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.ts"])) {
    testFrameworks.push("jest");
  }
  if (deps.has("playwright") || deps.has("@playwright/test") || hasAny(["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"])) {
    testFrameworks.push("playwright");
  }
  if (
    deps.has("rspec") ||
    fs.existsSync(path.join(root, "spec", "spec_helper.rb")) ||
    fs.existsSync(path.join(root, ".rspec")) ||
    (hasGemfile && /['"]rspec/.test(fs.readFileSync(path.join(root, "Gemfile"), "utf8")))
  ) {
    testFrameworks.push("rspec");
  }

  const lint = LINT_CONFIGS.filter((f) => fs.existsSync(path.join(root, f)));
  const typecheck = TYPECHECK_CONFIGS.filter((f) => fs.existsSync(path.join(root, f)));

  // --- git ---
  const repo = isGitRepo(root);
  const git = {
    repo,
    branch: repo ? gitBranch(root) : null,
    dirty: repo ? gitStatusPorcelain(root).length : 0,
  };

  // --- kit state ---
  const kit = {
    profile: fs.existsSync(path.join(root, ".ai", "project.yml")),
    specifications: countUnder(root, path.join("docs", "specifications")),
    plans: countUnder(root, path.join("docs", "plans")),
    adrs: countUnder(root, path.join("docs", "architecture", "adr")),
  };

  const report: InspectReport = {
    status: "ok",
    root,
    files: { total: files.length, truncated, byExtension },
    manifests: {
      packageJson: hasPackageJson,
      gemfile: hasGemfile,
      projectName: pkg !== null && typeof pkg.name === "string" ? pkg.name : null,
      scripts,
    },
    frameworks,
    testFrameworks,
    configs: { lint, typecheck },
    git,
    kit,
  };

  if (opts.json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out("kit inspect — project inventory");
    io.out("");
    io.out(`Files: ${report.files.total}${truncated ? " (capped)" : ""}`);
    io.out(`  by extension: ${byExtension.map((e) => `${e.ext}=${e.count}`).join(", ")}`);
    io.out(`Manifests: ${[hasPackageJson ? "package.json" : null, hasGemfile ? "Gemfile" : null].filter((x) => x !== null).join(", ") || "none"}`);
    io.out(`Frameworks: ${frameworks.join(", ") || "none detected"}`);
    io.out(`Test frameworks: ${testFrameworks.join(", ") || "none detected"}`);
    io.out(`Lint configs: ${lint.join(", ") || "none"}`);
    io.out(`Typecheck configs: ${typecheck.join(", ") || "none"}`);
    io.out(`Git: ${git.repo ? `repo, branch ${git.branch ?? "?"}, ${git.dirty} dirty` : "not a repository"}`);
    io.out(
      `Kit: profile ${kit.profile ? "present" : "missing"}, specs ${kit.specifications}, plans ${kit.plans}, ADRs ${kit.adrs}`
    );
  }
  return { exitCode: 0, report };
}
