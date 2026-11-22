import { describe, expect, it } from 'vitest';
import { runAdvise } from '../hooks/advise.js';
import { adviseForPrompt } from '../policies/advise.js';

describe('model-router advisory', () => {
  it('stays silent when the default model already fits', () => {
    expect(adviseForPrompt('rename a local variable')).toBeNull();
  });

  it('advises the strongest model for a production destructive request', () => {
    const advice = adviseForPrompt('drop the users table in production');
    expect(advice).toMatch(/suggests model opus/);
    expect(advice).toMatch(/not enforced by the host/);
  });

  it('treats a security-sensitive, multi-file request as high complexity', () => {
    const advice = adviseForPrompt('rework auth in a.ts b.ts c.ts d.ts e.ts f.ts g.ts h.ts i.ts j.ts k.ts');
    expect(advice).not.toBeNull();
  });

  it('never blocks: always exit 0, and nothing on malformed input', () => {
    expect(runAdvise('{bad')).toEqual({ exitCode: 0, stdout: '' });
    expect(runAdvise(JSON.stringify({ prompt: 42 }))).toEqual({ exitCode: 0, stdout: '' });
  });

  it('emits UserPromptSubmit additionalContext when it has advice', () => {
    const r = runAdvise(JSON.stringify({ prompt: 'force push to main in production' }));
    const body = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(body.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(body.hookSpecificOutput.additionalContext).toMatch(/model-router/);
  });
});
