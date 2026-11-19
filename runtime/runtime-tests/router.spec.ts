import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeAgent, routeMain } from '../model-router/policies/classify';
import type { RouterConfig } from '../model-router/policies/classify';

const empty: RouterConfig = { enabled: true, agents: {} };

function must<T>(v: T | null): T {
  if (v === null) throw new Error('expected a routing decision');
  return v;
}


// ---------------------------------------------------------------------------
// routeAgent — explicit mappings
// ---------------------------------------------------------------------------

test('explicit agent mapping wins', () => {
  const cfg: RouterConfig = {
    enabled: true,
    agents: {
      'security-reviewer': { model: 'claude-opus-4-6', effort: 'high' },
      'repository-analyst': { model: 'claude-haiku-4-5' },
      'code-linter': { model: 'inherit', effort: 'low' },
      'noop-agent': { model: 'inherit' },
    },
  };
  const r = must(routeAgent('security-reviewer', cfg));
  assert.equal(r.model, 'claude-opus-4-6');
  assert.equal(r.effort, 'high');
  assert.equal(r.tier, 'reasoning');
  assert.match(r.reason, /explicit/);

  const analyst = must(routeAgent('repository-analyst', cfg));
  assert.equal(analyst.model, 'claude-haiku-4-5');
  assert.equal(analyst.effort, undefined);

  // model "inherit" keeps the engine default; only effort (if any) would apply
  const linter = must(routeAgent('code-linter', cfg));
  assert.equal(linter.model, undefined);
  assert.equal(linter.effort, 'low');
  assert.equal(linter.tier, 'fast');

  // nothing to apply → null
  assert.equal(routeAgent('noop-agent', cfg), null);
});

// ---------------------------------------------------------------------------
// routeAgent — keyword heuristic
// ---------------------------------------------------------------------------

test('review/security/architect agents route to reasoning tier', () => {
  for (const name of ['security-reviewer', 'code-reviewer', 'architecture-reviewer', 'architect', 'REVIEWER']) {
    const r = must(routeAgent(name, empty));
    assert.equal(r.tier, 'reasoning', name);
    assert.equal(r.effort, 'high', name);
    assert.equal(r.model, undefined, name); // engine default model stands
  }
});

test('analyst/discovery agents route to balanced tier', () => {
  for (const name of ['repository-analyst', 'discovery-agent', 'explorer', 'requirements-analyst']) {
    const r = must(routeAgent(name, empty));
    assert.equal(r.tier, 'balanced', name);
    assert.equal(r.effort, 'medium', name);
  }
});

test('mechanical agents route to fast tier', () => {
  for (const name of ['code-linter', 'format-agent', 'summarizer', 'indexer', 'lint-runner']) {
    const r = must(routeAgent(name, empty));
    assert.equal(r.tier, 'fast', name);
    assert.equal(r.effort, 'low', name);
  }
});

test('unrecognized agent names are not touched', () => {
  for (const name of ['implementer', 'tester', 'random', 'debugger', '']) {
    assert.equal(routeAgent(name, empty), null, name);
  }
});

test('explicit mapping wins over the keyword heuristic', () => {
  const cfg: RouterConfig = {
    enabled: true,
    agents: { 'security-reviewer': { model: 'claude-haiku-4-5', effort: 'low' } },
  };
  const r = must(routeAgent('security-reviewer', cfg));
  assert.equal(r.model, 'claude-haiku-4-5');
  assert.equal(r.effort, 'low');
  assert.equal(r.tier, 'fast');
});

// ---------------------------------------------------------------------------
// routeMain — pinned-model preservation
// ---------------------------------------------------------------------------

test('routeMain returns null when no main model is configured', () => {
  assert.equal(routeMain('claude-sonnet-4-5', empty), null);
  assert.equal(routeMain(undefined, empty), null);
  assert.equal(routeMain('claude-sonnet-4-5', { enabled: true, main: {}, agents: {} }), null);
});

test('routeMain only fires when configured and different', () => {
  const cfg: RouterConfig = { enabled: true, main: { model: 'claude-opus-4-6' }, agents: {} };
  assert.deepEqual(routeMain('claude-sonnet-4-5', cfg), { model: 'claude-opus-4-6' });
  assert.deepEqual(routeMain(undefined, cfg), { model: 'claude-opus-4-6' });
  // pinned-model preservation: same model → no rewrite
  assert.equal(routeMain('claude-opus-4-6', cfg), null);
});
