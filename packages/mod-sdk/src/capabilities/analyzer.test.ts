// packages/mod-sdk/src/capabilities/analyzer.test.ts
import { describe, expect, it } from 'vitest';
import { analyzeRegisterSource } from './analyzer.js';
import type { ModCapabilities } from './manifest.js';

const declared: ModCapabilities = {
  id: 'test-mod',
  version: '0.7.0',
  hooks: ['tool.call', 'tool.check'],
  apiAccess: ['ui.log', 'state.get'],
  filesystemAccess: [],
  networkAccess: false,
  processExecution: false,
  modifiesPrompts: false,
  modifiesToolCalls: true,
  modifiesModels: false,
  learningAutonomyLevel: 'L0',
};

describe('analyzeRegisterSource', () => {
  it('extracts declared hooks and api access from source', () => {
    const source = `
      export function register(on) {
        on('tool.call', async ($, e, next) => {
          $.ui.log('hi');
          $.state.get('x');
          return next(e);
        });
        on('tool.check', async ($, e, next) => next(e));
      }
    `;
    const r = analyzeRegisterSource(source, declared);
    expect(r.declaredHooks).toContain('tool.call');
    expect(r.declaredHooks).toContain('tool.check');
    expect(r.declaredApiAccess).toContain('ui.log');
    expect(r.declaredApiAccess).toContain('state.get');
    expect(r.mismatches).toEqual([]);
  });

  it('flags a hook used in source but not declared in manifest', () => {
    const source = `
      export function register(on) {
        on('turn.step', async ($, e, next) => next(e));
      }
    `;
    const r = analyzeRegisterSource(source, declared);
    expect(r.mismatches).toContain(
      "source registers hook 'turn.step' but manifest does not declare it",
    );
  });

  it('flags an API used in source but not declared in manifest', () => {
    const source = `
      export function register(on) {
        on('tool.call', async ($, e, next) => {
          $.fs.read('/x');
          return next(e);
        });
      }
    `;
    const r = analyzeRegisterSource(source, declared);
    expect(r.mismatches.some((m) => m.includes('fs.read'))).toBe(true);
  });

  it('flags network access when manifest declares networkAccess=false', () => {
    const source = `
      export function register(on) {
        on('tool.call', async ($, e, next) => {
          await $.http.fetch('https://example.com');
          return next(e);
        });
      }
    `;
    const r = analyzeRegisterSource(source, declared);
    expect(r.mismatches.some((m) => m.includes('http.fetch'))).toBe(true);
  });
});
