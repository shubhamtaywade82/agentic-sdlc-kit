// packages/core/src/discovery/stack-detector.ts
//
// Read-only inspection of repository manifests to identify stacks,
// package managers, and test frameworks without executing any scripts.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface StackDetectionResult {
  detectedStacks: string[];
  packageManagers: string[];
  testFrameworks: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await fs.stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function detectNodePackageManagers(
  locks: { pnpm: boolean; npm: boolean; yarn: boolean; bun: boolean },
  pkgJsonExists: boolean,
): string[] {
  const managers: string[] = [];
  if (locks.pnpm) managers.push('pnpm');
  if (locks.npm) managers.push('npm');
  if (locks.yarn) managers.push('yarn');
  if (locks.bun) managers.push('bun');
  if (managers.length === 0 && pkgJsonExists) managers.push('npm');
  return managers;
}

function detectNodeTestFrameworks(pkg: PackageJson | null): string[] {
  if (!pkg) return [];
  const tests: string[] = [];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const testScript = pkg.scripts?.test ?? '';

  if (testScript.includes('node --test')) tests.push('node:test');
  if ('vitest' in deps || testScript.includes('vitest')) tests.push('vitest');
  if ('jest' in deps || testScript.includes('jest')) tests.push('jest');
  if ('mocha' in deps || testScript.includes('mocha')) tests.push('mocha');
  return tests;
}

function detectNodeStacks(pkg: PackageJson | null, hasTsConfig: boolean): string[] {
  if (!pkg && !hasTsConfig) return [];
  const stacks: string[] = [];
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const isTs = hasTsConfig || 'typescript' in deps;

  if ('next' in deps) stacks.push('nextjs');
  if ('react' in deps && isTs) stacks.push('react-typescript');
  // Only label as node-typescript when TypeScript is actually present.
  // A plain JS project with a package.json should NOT be mislabeled.
  if (isTs) stacks.push('node-typescript');
  // For plain Node.js (no TypeScript), use the generic label.
  if (!isTs && pkg) stacks.push('node');
  return stacks;
}

export async function detectStacks(root: string): Promise<StackDetectionResult> {
  const pkgPath = path.join(root, 'package.json');
  const pkg = await readJsonSafe<PackageJson>(pkgPath);
  const pkgExists = pkg !== null;
  const hasTsConfig = await fileExists(path.join(root, 'tsconfig.json'));

  const locks = {
    pnpm:
      (await fileExists(path.join(root, 'pnpm-lock.yaml'))) ||
      (await fileExists(path.join(root, 'pnpm-workspace.yaml'))),
    npm: await fileExists(path.join(root, 'package-lock.json')),
    yarn: await fileExists(path.join(root, 'yarn.lock')),
    bun:
      (await fileExists(path.join(root, 'bun.lockb'))) ||
      (await fileExists(path.join(root, 'bun.lock'))),
  };

  const detectedStacks = detectNodeStacks(pkg, hasTsConfig);
  const packageManagers = detectNodePackageManagers(locks, pkgExists);
  const testFrameworks = detectNodeTestFrameworks(pkg);

  await checkRails(root, detectedStacks, packageManagers, testFrameworks);
  await checkPython(root, detectedStacks, packageManagers, testFrameworks);
  await checkGoAndRust(root, detectedStacks, packageManagers, testFrameworks);

  return { detectedStacks, packageManagers, testFrameworks };
}

async function checkRails(
  root: string,
  stacks: string[],
  managers: string[],
  tests: string[],
): Promise<void> {
  const hasGemfile = await fileExists(path.join(root, 'Gemfile'));
  const hasRailsApp = await fileExists(path.join(root, 'config/application.rb'));
  if (hasGemfile || hasRailsApp) {
    stacks.push('ruby-rails');
    if (!managers.includes('bundler')) managers.push('bundler');
    const hasRspec =
      (await fileExists(path.join(root, '.rspec'))) || (await fileExists(path.join(root, 'spec')));
    if (hasRspec && !tests.includes('rspec')) tests.push('rspec');
  }
}

async function checkPython(
  root: string,
  stacks: string[],
  managers: string[],
  tests: string[],
): Promise<void> {
  const hasPyproject = await fileExists(path.join(root, 'pyproject.toml'));
  const hasReqs = await fileExists(path.join(root, 'requirements.txt'));
  if (hasPyproject || hasReqs) {
    stacks.push('python');
    if (!managers.includes('pip')) managers.push('pip');
    if (!tests.includes('pytest')) tests.push('pytest');
  }
}

async function checkGoAndRust(
  root: string,
  stacks: string[],
  managers: string[],
  tests: string[],
): Promise<void> {
  if (await fileExists(path.join(root, 'go.mod'))) {
    stacks.push('go');
    managers.push('go');
    tests.push('go test');
  }
  if (await fileExists(path.join(root, 'Cargo.toml'))) {
    stacks.push('rust');
    managers.push('cargo');
    tests.push('cargo test');
  }
}
