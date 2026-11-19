// plugins/sdlc-guard/tests/shell-policy.test.ts
import { describe, expect, it } from 'vitest';
import { classifyShellCommand } from '../policies/shell-policy.js';

describe('classifyShellCommand', () => {
  it('classifies rm -rf as file.delete', () => {
    const a = classifyShellCommand('rm -rf src/');
    expect(a?.category).toBe('file.delete');
    expect(a?.impact).toBe('local');
  });
  it('classifies git push --force as git.force-push with shared-branch impact', () => {
    const a = classifyShellCommand('git push origin main --force');
    expect(a?.category).toBe('git.force-push');
    expect(a?.impact).toBe('shared-branch');
  });
  it('classifies git rebase as git.rebase', () => {
    const a = classifyShellCommand('git rebase main');
    expect(a?.category).toBe('git.rebase');
  });
  it('classifies rails db:migrate as db.migrate', () => {
    const a = classifyShellCommand('rails db:migrate');
    expect(a?.category).toBe('db.migrate');
  });
  it('classifies RAILS_ENV=production db:reset as db.mutate-production (critical)', () => {
    const a = classifyShellCommand('RAILS_ENV=production rails db:reset');
    expect(a?.category).toBe('db.mutate-production');
    expect(a?.impact).toBe('production');
  });
  it('classifies npm publish as release.publish', () => {
    const a = classifyShellCommand('npm publish');
    expect(a?.category).toBe('release.publish');
    expect(a?.impact).toBe('production');
  });
  it('classifies kubectl apply as release.deploy', () => {
    const a = classifyShellCommand('kubectl apply -f deploy.yaml');
    expect(a?.category).toBe('release.deploy');
  });
  it('returns null for a safe command', () => {
    expect(classifyShellCommand('ls -la')).toBeNull();
    expect(classifyShellCommand('echo hello')).toBeNull();
    expect(classifyShellCommand('git status')).toBeNull();
  });
});
