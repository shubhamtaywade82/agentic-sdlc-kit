// packages/core/src/stacks/stack-pack.test.ts
import { describe, expect, it } from 'vitest';
import { listStackPacks, resolveStackPack } from './stack-pack.js';

describe('Stack Packs (M14)', () => {
  it('resolves node-typescript stack pack', () => {
    const pack = resolveStackPack('node-typescript');
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('Node.js / TypeScript');
    expect(pack?.defaultCommands.test).toEqual([['pnpm', 'test']]);
  });

  it('resolves ruby-rails stack pack', () => {
    const pack = resolveStackPack('ruby-rails');
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('Ruby on Rails');
    expect(pack?.defaultCommands.test).toEqual([['bundle', 'exec', 'rspec']]);
  });

  it('lists all registered stack packs', () => {
    const packs = listStackPacks();
    expect(packs.length).toBeGreaterThanOrEqual(5);
    const ids = packs.map((p) => p.id);
    expect(ids).toContain('node-typescript');
    expect(ids).toContain('react-typescript');
    expect(ids).toContain('ruby-rails');
    expect(ids).toContain('python');
    expect(ids).toContain('go');
  });
});
