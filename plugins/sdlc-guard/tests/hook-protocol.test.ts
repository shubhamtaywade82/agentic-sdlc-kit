// Protocol contract for the command hook: stdin event JSON in; exit code and
// stdout/stderr out. These exit codes are what Claude Code acts on.
import { describe, expect, it } from 'vitest';
import { runGuard } from '../hooks/guard.js';

const bash = (command: unknown) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

describe('sdlc-guard hook protocol', () => {
  it('allows silently (exit 0, no output) for benign Bash', () => {
    expect(runGuard(bash('git status'))).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('ignores non-Bash tools', () => {
    const r = runGuard(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'a' } }));
    expect(r.exitCode).toBe(0);
  });

  it('asks via hookSpecificOutput.permissionDecision = "ask" with exit 0', () => {
    const r = runGuard(bash('rm -rf dist'));
    expect(r.exitCode).toBe(0);
    const body = JSON.parse(r.stdout) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string };
    };
    expect(body.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(body.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(body.hookSpecificOutput.permissionDecisionReason).toMatch(/sdlc-guard/);
  });

  it('fails closed with exit 2 on unreadable input (never a non-blocking code)', () => {
    const r = runGuard('{not json');
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/fail closed/);
  });

  it('fails closed with exit 2 when a Bash event carries no command string', () => {
    expect(runGuard(bash(undefined)).exitCode).toBe(2);
    expect(runGuard(bash(42)).exitCode).toBe(2);
  });
});
