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

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

interface Pkg {
  name: string;
  dir: string;
  allowedImports: ReadonlyArray<string>;
}

const PACKAGES: ReadonlyArray<Pkg> = [
  {
    name: 'contracts',
    dir: path.join(ROOT, 'packages/contracts'),
    allowedImports: [], // contracts imports nothing from siblings
  },
  {
    name: 'core',
    dir: path.join(ROOT, 'packages/core'),
    allowedImports: ['@agentic-sdlc-kit/contracts'],
  },
  {
    name: 'cli',
    dir: path.join(ROOT, 'packages/cli'),
    allowedImports: ['@agentic-sdlc-kit/contracts', '@agentic-sdlc-kit/core'],
  },
  {
    name: 'testing',
    dir: path.join(ROOT, 'packages/testing'),
    allowedImports: ['@agentic-sdlc-kit/contracts'],
  },
  {
    name: 'claude-code-adapter',
    dir: path.join(ROOT, 'packages/claude-code-adapter'),
    allowedImports: ['@agentic-sdlc-kit/contracts'],
  },
  {
    name: 'mod-sdk',
    dir: path.join(ROOT, 'packages/mod-sdk'),
    allowedImports: ['@agentic-sdlc-kit/contracts', '@agentic-sdlc-kit/core'],
  },
  // Plugins: each Mod imports from contracts, core (where applicable),
  // and mod-sdk. Plugins MUST NOT import from cli or from each other.
  {
    name: 'plugin-sdlc-guard',
    dir: path.join(ROOT, 'plugins/sdlc-guard'),
    allowedImports: [
      '@agentic-sdlc-kit/contracts',
      '@agentic-sdlc-kit/core',
      '@agentic-sdlc-kit/mod-sdk',
    ],
  },
  {
    name: 'plugin-secret-guard',
    dir: path.join(ROOT, 'plugins/secret-guard'),
    allowedImports: [
      '@agentic-sdlc-kit/contracts',
      '@agentic-sdlc-kit/core',
      '@agentic-sdlc-kit/mod-sdk',
    ],
  },
  {
    name: 'plugin-model-router',
    dir: path.join(ROOT, 'plugins/model-router'),
    allowedImports: ['@agentic-sdlc-kit/contracts', '@agentic-sdlc-kit/mod-sdk'],
  },
  {
    name: 'plugin-run-observer',
    dir: path.join(ROOT, 'plugins/run-observer'),
    allowedImports: ['@agentic-sdlc-kit/contracts', '@agentic-sdlc-kit/mod-sdk'],
  },
];

const SIBLING_PREFIX = '@agentic-sdlc-kit/';

async function listTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listTsFiles(full)));
    } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) {
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
  // Plugins use hooks/ and policies/ instead of src/. Scan whichever exists.
  const candidateDirs = ['src', 'hooks', 'policies'].map((d) => path.join(pkg.dir, d));
  const violations: Violation[] = [];
  let files: string[] = [];
  let foundAny = false;
  for (const dir of candidateDirs) {
    try {
      const list = await listTsFiles(dir);
      if (list.length > 0) {
        files = files.concat(list);
        foundAny = true;
      }
    } catch {
      // dir doesn't exist; skip
    }
  }
  if (!foundAny) {
    return [
      {
        pkg: pkg.name,
        file: pkg.dir,
        importStatement: '',
        reason: 'no src/, hooks/, or policies/ TypeScript files found',
      },
    ];
  }
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
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
      if (specifier.includes('/dist/') || specifier.endsWith('/dist')) {
        violations.push({
          pkg: pkg.name,
          file: path.relative(ROOT, file),
          importStatement: specifier,
          reason: "imports from a sibling's dist/ (forbidden)",
        });
        continue;
      }
      // Extract the package name: @agentic-sdlc-kit/<name>[/...]
      const sibling = specifier.slice(SIBLING_PREFIX.length).split('/')[0];
      if (sibling === undefined) continue;
      if (!pkg.allowedImports.includes(SIBLING_PREFIX + sibling)) {
        violations.push({
          pkg: pkg.name,
          file: path.relative(ROOT, file),
          importStatement: specifier,
          reason: `package ${sibling} not in allow-list for ${pkg.name} (allowed: ${
            pkg.allowedImports.map((s) => s.slice(SIBLING_PREFIX.length)).join(', ') || 'none'
          })`,
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
    console.log('check-architecture: OK — all invariants hold');
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
  console.error('check-architecture: internal error', e);
  process.exit(2);
});
