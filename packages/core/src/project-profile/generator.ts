// packages/core/src/project-profile/generator.ts
//
// Generates a ProjectProfile from a RepositoryScan.
// The scan is read-only; the generator shapes data, never executes anything.

import {
  Errors,
  type ProjectProfile,
  type RepositoryScan,
  type Result,
} from '@agentic-sdlc-kit/contracts';
import { validateProfile } from './validator.js';
import { commandsForStack } from '../stacks/stack-commands.js';

function deriveCommands(scan: RepositoryScan): ProjectProfile['commands'] {
  const commands: ProjectProfile['commands'] = {};
  const primary = scan.detectedStacks[0];
  const pm = scan.packageManagers[0] ?? 'pnpm';

  if (scan.testFrameworks.includes('node:test')) {
    // Use auto-discovery (no path argument): `node --test tests/` with a bare
    // directory argument breaks on Node >= 24 (the test runner treats the
    // directory as a test file). Auto-discovery works on Node 18.13+ through
    // 24+, finds **/*.test.?(c|m)js files, and excludes node_modules.
    commands.test = [['node', '--test']];
    return commands;
  }
  if (primary === undefined) return commands;
  const fromPack = commandsForStack(primary, { packageManager: pm }) ?? {};
  // The scan can confirm pytest but not ruff or mypy. Writing their commands
  // for a project that does not use them would make every verify run fail, so
  // only the test command is derived for Python. Add lint/typecheck by hand.
  // Plain Ruby and Rails get the same treatment: the scan confirms RSpec,
  // not RuboCop (many Rails apps use standardrb or no linter at all), so
  // deriving `bundle exec rubocop` would fail every verify run.
  if (primary === 'python' || primary === 'ruby' || primary === 'ruby-rails')
    return fromPack.test ? { test: fromPack.test } : commands;
  return fromPack;
}

export function generateProfile(scan: RepositoryScan): Result<ProjectProfile> {
  const primary = scan.detectedStacks[0];
  if (!primary) {
    return {
      ok: false,
      error: Errors.discoveryFailed('RepositoryScan did not detect any stacks'),
    };
  }

  const candidate: ProjectProfile = {
    schemaVersion: 1,
    name: deriveName(scan),
    stack: scan.detectedStacks,
    commands: deriveCommands(scan),
  };
  return validateProfile(candidate);
}

function deriveName(scan: RepositoryScan): string {
  const trimmed = scan.root.replace(/\/+$/, '');
  const segments = trimmed.split('/');
  const last = segments[segments.length - 1];
  if (!last) return 'unnamed-project';
  return (
    last
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unnamed-project'
  );
}
