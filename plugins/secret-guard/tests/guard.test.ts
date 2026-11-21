// Protocol and decision tests for the secret-guard command hook. The git
// diff is injected, so these tests never touch a real repository.
import { describe, expect, it } from 'vitest';
import { runGuard } from '../hooks/guard.js';

const AWS = 'AKIAIOSFODNN7EXAMPLE';
const GH = 'ghp_' + 'a'.repeat(36);

const write = (content: string, tool = 'Write') =>
  JSON.stringify({ tool_name: tool, tool_input: { file_path: 'config/app.ts', content } });
const commit = (command = 'git commit -m "wip"') =>
  JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: '/repo' });
const noDiff = () => '';

describe('secret-guard file writes', () => {
  it('allows a write with no secret', () => {
    expect(runGuard(write('export const x = 1;'), noDiff)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('denies (exit 2) a write containing an AWS key and names kind and line, not the value', () => {
    const r = runGuard(write(`line one\nconst k = "${AWS}";`), noDiff);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/aws-access-key at line 2/);
    expect(r.stderr).toMatch(/config\/app\.ts/);
    expect(r.stderr).not.toContain(AWS);
  });

  it('checks Edit new_string and MultiEdit edits, not only Write content', () => {
    const edit = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.ts', new_string: GH } });
    expect(runGuard(edit, noDiff).exitCode).toBe(2);
    const multi = JSON.stringify({
      tool_name: 'MultiEdit',
      tool_input: { file_path: 'a.ts', edits: [{ new_string: 'ok' }, { new_string: GH }] },
    });
    expect(runGuard(multi, noDiff).exitCode).toBe(2);
  });
});

describe('secret-guard git commit', () => {
  it('denies a commit whose staged diff ADDS a secret', () => {
    const diff = `+++ b/.env\n@@ -0,0 +1 @@\n+TOKEN=${GH}\n`;
    const r = runGuard(commit(), () => diff);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/github-token/);
    expect(r.stderr).not.toContain(GH);
  });

  it('ignores secrets that a commit only REMOVES', () => {
    const diff = `--- a/.env\n+++ b/.env\n@@ -1 +0,0 @@\n-TOKEN=${GH}\n`;
    expect(runGuard(commit(), () => diff).exitCode).toBe(0);
  });

  it('fails CLOSED when the staged diff cannot be read', () => {
    const r = runGuard(commit(), () => {
      throw new Error('not a git repository');
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/fail closed/);
  });

  it('does not scan non-commit git commands', () => {
    let scanned = false;
    const r = runGuard(commit('git status'), () => {
      scanned = true;
      return '';
    });
    expect(scanned).toBe(false);
    expect(r.exitCode).toBe(0);
  });

  it('recognises commit after global git options', () => {
    let scanned = false;
    runGuard(commit('git -C sub commit -m x'), () => {
      scanned = true;
      return '';
    });
    expect(scanned).toBe(true);
  });
});

describe('secret-guard protocol', () => {
  it('fails closed on unreadable input', () => {
    expect(runGuard('{oops', noDiff).exitCode).toBe(2);
  });

  it('ignores tools it does not gate', () => {
    expect(runGuard(JSON.stringify({ tool_name: 'Read', tool_input: {} }), noDiff).exitCode).toBe(0);
  });
});
