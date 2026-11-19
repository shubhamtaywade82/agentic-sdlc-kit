import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPath, globMatch } from '../sdlc-guard/policies/files';
import { DEFAULT_PROTECTED_PATHS, defaultGuardConfig } from '../sdlc-guard/policies/config';

// ---------------------------------------------------------------------------
// glob matcher semantics
// ---------------------------------------------------------------------------

test('** matches any depth under a directory', () => {
  assert.ok(globMatch('.github/workflows/**', '.github/workflows/ci.yml'));
  assert.ok(globMatch('.github/workflows/**', '.github/workflows/jobs/deploy.yml'));
  assert.ok(globMatch('.github/workflows/**', '.github/workflows/a/b/c/d.yml'));
  assert.ok(!globMatch('.github/workflows/**', '.github/other.yml'));
  assert.ok(!globMatch('.github/workflows/**', 'src/x/ci.yml'));
  assert.ok(!globMatch('.github/workflows/**', '.gitlab-ci.yml'));
  // protective: a nested copy under any parent directory is still matched
  assert.ok(globMatch('.github/workflows/**', 'docs/.github/workflows/ci.yml'));
});

test('exact and single-star segments', () => {
  assert.ok(globMatch('.env', '.env'));
  assert.ok(!globMatch('.env', '.env.local'));
  assert.ok(globMatch('.env.*', '.env.local'));
  assert.ok(globMatch('.env.*', '.env.production'));
  assert.ok(!globMatch('.env.*', '.env'));
  assert.ok(globMatch('*.pem', 'server.pem'));
  assert.ok(!globMatch('*.pem', 'server.pem.bak'));
  assert.ok(!globMatch('*.pem', 'server.key'));
});

test('suffix matching catches nested and absolute paths (protective)', () => {
  // single-segment patterns match the basename at any depth
  assert.ok(globMatch('*.pem', 'certs/server.pem'));
  assert.ok(globMatch('.env', 'config/.env'));
  assert.ok(globMatch('.env.*', 'deploy/.env.production'));
  // multi-segment patterns match the tail of absolute session paths
  assert.ok(globMatch('.github/workflows/**', '/home/dev/proj/.github/workflows/ci.yml'));
  assert.ok(globMatch('.git/**', '/home/dev/proj/.git/hooks/pre-commit'));
  assert.ok(globMatch('.git/**', '.git/config'));
  assert.ok(globMatch('.git/**', '.git/index'));
});

test('dotfile boundaries are respected', () => {
  assert.ok(!globMatch('.git/**', '.gitignore'));
  assert.ok(!globMatch('.git/**', '.gitmodules'));
  assert.ok(!globMatch('.env', '.envrc'));
});

// ---------------------------------------------------------------------------
// assessPath with default config
// ---------------------------------------------------------------------------

const cfg = defaultGuardConfig();

test('default protected paths deny workflows, git internals and env/key files', () => {
  for (const p of [
    '.github/workflows/ci.yml',
    '.github/workflows/deploy/jobs/build.yml',
    '.git/config',
    '.git/hooks/pre-commit',
    '.env',
    '.env.local',
    'config/.env',
    'certs/server.pem',
    'keys/id_rsa.key',
  ]) {
    const v = assessPath(p, cfg);
    assert.equal(v.action, 'deny', p);
    assert.match(v.reason, /protected path pattern/);
  }
});

test('ordinary project files are allowed, including .ai/ state', () => {
  for (const p of [
    'src/index.ts',
    'README.md',
    'package.json',
    'docs/security/threat-models/auth.md',
    '.ai/project.yml',
    '.ai/manifest',
    '.gitignore',
  ]) {
    assert.equal(assessPath(p, cfg).action, 'allow', p);
  }
});

test('fail-closed default: .env.* also covers .env.example and .env.sample', () => {
  // Documented behavior: the default glob is deny-class. To make example env
  // files writable, set an explicit guard.protectedPaths list without .env.*
  // (see profile.spec.ts) or have the user edit the file manually.
  assert.equal(assessPath('.env.example', cfg).action, 'deny');
  assert.equal(assessPath('.env.sample', cfg).action, 'deny');
});

test('extra globs extend protection', () => {
  const extended = { protectedPaths: DEFAULT_PROTECTED_PATHS.concat(['terraform/**']) };
  assert.equal(assessPath('terraform/main.tf', extended).action, 'deny');
  assert.equal(assessPath('terraform/modules/vpc/main.tf', extended).action, 'deny');
  assert.equal(assessPath('src/main.ts', extended).action, 'allow');
});

test('empty paths are allowed', () => {
  assert.equal(assessPath('', cfg).action, 'allow');
  assert.equal(assessPath('   ', cfg).action, 'allow');
});
