import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROTECTED_PATHS,
  defaultGuardConfig,
  parseGuardProfile,
  parseYaml,
} from '../sdlc-guard/policies/config';
import { defaultRouterConfig, parseRouterProfile, routerActive } from '../model-router/policies/profile';
import { defaultObserverConfig, parseObserverProfile } from '../run-observer/policies/profile';

const FULL_PROFILE = [
  'version: 1',
  'project:',
  '  name: demo-app',
  '  mode: existing',
  '',
  'policies:',
  '  tdd: required',
  '  approvals:',
  '    migrations: not-required',
  '    deployment: required',
  '    forcePush: prohibited',
  '  protectedPaths:',
  '    - "secrets/**"',
  '    - infra/**',
  '',
  'guard:',
  '  protectedPaths:',
  '    - terraform/**',
  '',
  '# trailing comment',
].join('\n');

// ---------------------------------------------------------------------------
// YAML subset parser (exercised via sdlc-guard's vendored copy)
// ---------------------------------------------------------------------------

test('parses the supported subset: nested maps, sequences, quotes, comments', () => {
  const doc = parseYaml(FULL_PROFILE);
  assert.deepEqual(doc['version'], '1');
  const project = doc['project'];
  assert.ok(typeof project === 'object' && !Array.isArray(project));
  assert.deepEqual((project as { [k: string]: unknown })['name'], 'demo-app');
  const policies = doc['policies'] as { [k: string]: unknown };
  const approvals = policies['approvals'] as { [k: string]: unknown };
  assert.deepEqual(approvals['migrations'], 'not-required');
  assert.deepEqual(policies['protectedPaths'], ['secrets/**', 'infra/**']);
  assert.deepEqual(doc['guard'], { protectedPaths: ['terraform/**'] });
});

test('quoted scalars, escapes and inline comments', () => {
  const doc = parseYaml([
    'name: "my app"',          // double quotes preserved content
    'path: \'src/**\'',        // single quotes
    'empty: ""',
    'note: "a \\"quoted\\" word"',
    'trailing: value # comment',
    '# full line comment',
    '',
  ].join('\n'));
  assert.deepEqual(doc['name'], 'my app');
  assert.deepEqual(doc['path'], 'src/**');
  assert.deepEqual(doc['empty'], '');
  assert.deepEqual(doc['note'], 'a "quoted" word');
  assert.deepEqual(doc['trailing'], 'value');
});

test('rejects tabs', () => {
  assert.throws(() => parseYaml('policies:\n\tapprovals: required'), /tabs/);
  assert.throws(() => parseYaml('policies:\n  approvals:\trequired'), /tabs/);
});

test('rejects bad indentation', () => {
  assert.throws(() => parseYaml('a:\n   b: 1'), /2-space/); // odd indent
  assert.throws(() => parseYaml('a:\n      b: 1'), /2-space|deeper/); // more than one step
  assert.throws(() => parseYaml('a: 1\n    b: 2'), /indent/); // unexpected deeper line
});

test('rejects other out-of-subset constructs', () => {
  assert.throws(() => parseYaml('- item'), /map/); // top-level sequence
  assert.throws(() => parseYaml('key: {a: 1}')); // flow map
  assert.throws(() => parseYaml('a: 1\na: 2'), /duplicate/);
  assert.throws(() => parseYaml('just a scalar'), /key/);
  assert.throws(() => parseYaml('a: "unterminated'));
});

test('empty input parses to an empty map', () => {
  assert.deepEqual(parseYaml(''), {});
  assert.deepEqual(parseYaml('\n\n# only comments\n'), {});
});

// ---------------------------------------------------------------------------
// guard profile mapping + defaults
// ---------------------------------------------------------------------------

test('guard defaults: approvals required, default protected paths', () => {
  const cfg = defaultGuardConfig();
  assert.deepEqual(cfg.approvals, { migrations: 'required', deployment: 'required' });
  assert.deepEqual(cfg.protectedPaths, DEFAULT_PROTECTED_PATHS);
});

test('empty/missing profile maps to the documented defaults', () => {
  // a missing .ai/project.yml short-circuits to defaultGuardConfig() in the
  // hook; an empty file parses to {} and projects onto the same defaults
  assert.deepEqual(parseGuardProfile(''), defaultGuardConfig());
  assert.deepEqual(parseRouterProfile(''), defaultRouterConfig());
  assert.deepEqual(parseObserverProfile(''), defaultObserverConfig());
});

test('guard profile mapping: approvals, path layering, unknown keys ignored', () => {
  const cfg = parseGuardProfile(FULL_PROFILE);
  assert.deepEqual(cfg.approvals.migrations, 'not-required');
  assert.deepEqual(cfg.approvals.deployment, 'required');
  // explicit guard.protectedPaths replaces the defaults; policies paths and
  // the always-on .git/** are unioned on top
  assert.deepEqual(cfg.protectedPaths, ['terraform/**', 'secrets/**', 'infra/**', '.git/**']);
  // project.name / tdd / version are unknown to the guard → ignored, no throw
});

test('explicit guard.protectedPaths replaces defaults but .git/** always applies', () => {
  const cfg = parseGuardProfile(['guard:', '  protectedPaths:', '    - terraform/**'].join('\n'));
  assert.deepEqual(cfg.protectedPaths, ['terraform/**', '.git/**']);
});

test('invalid values throw → caller falls back to documented defaults', () => {
  assert.throws(() => parseGuardProfile('policies:\n  approvals:\n    migrations: sometimes'));
  assert.throws(() => parseGuardProfile('policies:\n  approvals:\n    forcePush: allowed'));
  assert.throws(() => parseGuardProfile('guard:\n  protectedPaths: .env')); // not a sequence
  // defaults document the fail-closed values
  const cfg = defaultGuardConfig();
  assert.equal(cfg.approvals.migrations, 'required');
  assert.equal(cfg.approvals.deployment, 'required');
});

// ---------------------------------------------------------------------------
// router profile mapping (same parser, different projection)
// ---------------------------------------------------------------------------

const ROUTER_PROFILE = [
  'version: 1',
  'router:',
  '  enabled: true',
  '  main:',
  '    model: claude-opus-4-6',
  '  agents:',
  '    repository-analyst:',
  '      model: claude-haiku-4-5',
  '      effort: medium',
  '    security-reviewer:',
  '      model: claude-opus-4-6',
  '      effort: high',
  '    code-linter:',
  '      model: inherit',
  '      effort: low',
].join('\n');

test('router defaults: disabled, no agents — fully pass-through', () => {
  const cfg = defaultRouterConfig();
  assert.equal(cfg.enabled, false);
  assert.equal(routerActive(cfg), false);
  assert.deepEqual(cfg.agents, {});
});

test('router profile mapping', () => {
  const cfg = parseRouterProfile(ROUTER_PROFILE);
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.main, { model: 'claude-opus-4-6' });
  assert.deepEqual(cfg.agents['repository-analyst'], { model: 'claude-haiku-4-5', effort: 'medium' });
  assert.deepEqual(cfg.agents['security-reviewer'], { model: 'claude-opus-4-6', effort: 'high' });
  assert.deepEqual(cfg.agents['code-linter'], { model: 'inherit', effort: 'low' });
  assert.equal(routerActive(cfg), true);
});

test('router.main without a usable model pins nothing', () => {
  const noModel = parseRouterProfile(['router:', '  main:'].join('\n'));
  assert.equal(noModel.main, undefined);
  const inherit = parseRouterProfile(['router:', '  main:', '    model: inherit'].join('\n'));
  assert.equal(inherit.main, undefined);
});

test('router activates on agents alone even when not explicitly enabled', () => {
  const cfg = parseRouterProfile(['router:', '  agents:', '    code-reviewer:', '      model: m1'].join('\n'));
  assert.equal(cfg.enabled, false);
  assert.equal(routerActive(cfg), true);
});

test('router invalid values throw → defaults (off)', () => {
  assert.throws(() => parseRouterProfile('router:\n  enabled: maybe'));
  assert.throws(() => parseRouterProfile('router:\n  agents:\n    x:\n      effort: turbo'));
  assert.throws(() => parseRouterProfile('router:\n  agents:\n    x: m1')); // not a map
  assert.equal(routerActive(defaultRouterConfig()), false);
});

test('router profile with no router key is inert', () => {
  const cfg = parseRouterProfile('version: 1\nproject:\n  name: x\n');
  assert.deepEqual(cfg, defaultRouterConfig());
});

// ---------------------------------------------------------------------------
// observer profile mapping (same parser, different projection)
// ---------------------------------------------------------------------------

test('observer defaults to enabled', () => {
  assert.deepEqual(defaultObserverConfig(), { enabled: true });
  assert.deepEqual(parseObserverProfile('version: 1\n'), { enabled: true });
  assert.deepEqual(parseObserverProfile(''), { enabled: true });
});

test('observer can be disabled', () => {
  const cfg = parseObserverProfile('observer:\n  enabled: false');
  assert.deepEqual(cfg, { enabled: false });
});

test('observer invalid values throw → defaults (enabled)', () => {
  assert.throws(() => parseObserverProfile('observer:\n  enabled: off'));
  assert.deepEqual(defaultObserverConfig(), { enabled: true });
});
