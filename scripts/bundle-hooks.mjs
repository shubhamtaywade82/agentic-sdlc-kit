// scripts/bundle-hooks.mjs
//
// Bundle a Claude Code plugin's hooks entry into a self-contained ESM file.
//
// Why: the real Claude Code plugin validator enforces two rules for modules
// listed in hooks/hooks.json:
//   1. Module paths resolve RELATIVE TO THE hooks/ DIRECTORY (where
//      hooks.json lives), not the plugin root.
//   2. A hooks module may only import its own files (relative paths) and
//      "claude-code" — nothing else. Workspace packages such as
//      "@agentic-sdlc-kit/core" are therefore forbidden in the shipped file.
//
// tsc alone cannot satisfy rule 2 (it preserves the workspace imports), so
// each plugin's build runs this script after tsc: it bundles
// hooks/register.ts with esbuild, inlining all workspace dependencies into
// dist/hooks/register.js, then verifies the result imports nothing that the
// validator would reject.
//
// Usage: node ../../scripts/bundle-hooks.mjs [pluginDir]
//   (default pluginDir = process cwd)

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const pluginDir = path.resolve(process.argv[2] ?? process.cwd());
const entry = path.join(pluginDir, 'hooks', 'register.ts');
const outfile = path.join(pluginDir, 'dist', 'hooks', 'register.js');

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  logLevel: 'warning',
  // Node builtins and "claude-code" stay external; everything else
  // (workspace packages, zod, ...) is inlined.
  external: ['node:*', 'claude-code'],
});

if (result.errors.length > 0) {
  console.error(`bundle-hooks: failed to bundle ${entry}`);
  process.exit(1);
}

// Self-check: the shipped module must not import ANYTHING the Claude Code
// plugin validator rejects. The real rule is strict: "a hooks module
// imports its own files by relative path and 'claude-code', nothing else"
// — node: builtins included. This is the kit's own guarantee, in the same
// spirit as the manifest tests — never ship what the real validator would
// refuse.
const emitted = await readFile(outfile, 'utf8');
const badImports = [...emitted.matchAll(/(?:from\s*|import\s*)(['"])([^'"]+)\1/g)]
  .map((m) => m[2])
  .filter((spec) => !spec.startsWith('.') && !spec.startsWith('/') && spec !== 'claude-code');

if (badImports.length > 0) {
  console.error(
    `bundle-hooks: ${path.relative(process.cwd(), outfile)} still imports ` +
      `forbidden modules: ${[...new Set(badImports)].join(', ')}. ` +
      'The bundle must be self-contained (relative imports, node:, and ' +
      '"claude-code" only).',
  );
  process.exit(1);
}

console.log(
  `bundle-hooks: ${path.relative(process.cwd(), outfile)} is self-contained (${emitted.length} bytes)`,
);
