// scripts/check-architecture.ts
//
// Architecture invariant gate. Runs in CI after `pnpm install` and BEFORE
// `pnpm verify`. Fails the build if any invariant is violated.
//
// Invariants (ARCHITECTURE.md §6):
//   1. contracts imports nothing from sibling packages.
//   2. core imports only from contracts.
//   3. cli imports only from core and contracts.
//   4. testing imports only from contracts.
//   5. claude-code-adapter imports only from contracts.
//   6. No package imports from a sibling's dist/.
//
// We enforce this by scanning each package's src/**/*.ts files for import
// statements and checking them against the per-package allow-list.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

interface Pkg {
  name: string;
  dir: string;
  allowedImports: ReadonlyArray<string>;
}

const PACKAGES: ReadonlyArray<Pkg> = [
  {
    name: "contracts",
    dir: path.join(ROOT, "packages/contracts"),
    allowedImports: [], // contracts imports nothing from siblings
  },
  {
    name: "core",
    dir: path.join(ROOT, "packages/core"),
    allowedImports: ["@agentic-sdlc-kit/contracts"],
  },
  {
    name: "cli",
    dir: path.join(ROOT, "packages/cli"),
    allowedImports: ["@agentic-sdlc-kit/contracts", "@agentic-sdlc-kit/core"],
  },
  {
    name: "testing",
    dir: path.join(ROOT, "packages/testing"),
    allowedImports: ["@agentic-sdlc-kit/contracts"],
  },
  {
    name: "claude-code-adapter",
    dir: path.join(ROOT, "packages/claude-code-adapter"),
    allowedImports: ["@agentic-sdlc-kit/contracts"],
  },
];

const SIBLING_PREFIX = "@agentic-sdlc-kit/";

async function listTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listTsFiles(full)));
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  pkg: string;
  file: string;
  importStatement: string;
  reason: string;
}

async function checkPackage(pkg: Pkg): Promise<Violation[]> {
  const srcDir = path.join(pkg.dir, "src");
  const violations: Violation[] = [];
  let files: string[];
  try {
    files = await listTsFiles(srcDir);
  } catch {
    return [{ pkg: pkg.name, file: srcDir, importStatement: "", reason: "src/ dir not found" }];
  }
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    // Match import statements. Handles:
    //   import ... from "..."
    //   import(...) (dynamic)
    //   export ... from "..."
    const importRegex = /(?:import|export)(?:\s+[^;]*?\s+from|\s*\(\s*)\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(content)) !== null) {
      const specifier = m[1];
      if (specifier === undefined) continue;
      // Only check @agentic-sdlc-kit/* imports; relative and external imports are fine.
      if (!specifier.startsWith(SIBLING_PREFIX)) continue;
      // Reject dist/ imports outright.
      if (specifier.includes("/dist/") || specifier.endsWith("/dist")) {
        violations.push({
          pkg: pkg.name,
          file: path.relative(ROOT, file),
          importStatement: specifier,
          reason: "imports from a sibling's dist/ (forbidden)",
        });
        continue;
      }
      // Extract the package name: @agentic-sdlc-kit/<name>[/...]
      const sibling = specifier.slice(SIBLING_PREFIX.length).split("/")[0];
      if (sibling === undefined) continue;
      if (!pkg.allowedImports.includes(SIBLING_PREFIX + sibling)) {
        violations.push({
          pkg: pkg.name,
          file: path.relative(ROOT, file),
          importStatement: specifier,
          reason: `package ${sibling} not in allow-list for ${pkg.name} (allowed: ${pkg.allowedImports
            .map((s) => s.slice(SIBLING_PREFIX.length))
            .join(", ") || "none"})`,
        });
      }
    }
  }
  return violations;
}

async function main(): Promise<void> {
  let allViolations: Violation[] = [];
  for (const pkg of PACKAGES) {
    const v = await checkPackage(pkg);
    allViolations = allViolations.concat(v);
  }
  if (allViolations.length === 0) {
    console.log("check-architecture: OK — all invariants hold");
    return;
  }
  console.error(`check-architecture: ${allViolations.length} violation(s) found`);
  for (const v of allViolations) {
    console.error(`  [${v.pkg}] ${v.file}: ${v.importStatement}`);
    console.error(`    → ${v.reason}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("check-architecture: internal error", e);
  process.exit(2);
});
