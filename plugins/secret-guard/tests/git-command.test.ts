// plugins/secret-guard/tests/git-command.test.ts
//
// Which Bash commands create or publish git history. Token-based (vendored
// from sdlc-guard's parser), so quoted text is not a command, and git's global
// options, wrappers and nested shells are seen through.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGitActions } from '../policies/git-command';

const actions = (cmd: string) => parseGitActions(cmd).map((a) => `${a.action}${a.stageTracked ? '+tracked' : ''}${a.uncertain ? '?' : ''}`);

describe('parseGitActions: commands that create or publish history', () => {
  it.each([
    ['git commit -m x', ['commit']],
    ['git push', ['push']],
    ['git push --force origin', ['push']],
    ['git push origin main', ['push?']],
    ['git push --all', ['push?']],
    ['git push --tags', ['push?']],
    ['git push --mirror', ['push?']],
    ['git push origin feature:production', ['push?']],
    ['git push --force-with-lease origin', ['push?']],
    ['git -C /tmp/repo commit -m x', ['commit?']],
    ['git -c user.name=x commit -m x', ['commit?']],
    ['git --no-pager commit -m x', ['commit?']],
    ['git --git-dir /a/.git push', ['push?']],
    ['git --git-dir=/a/.git push', ['push?']],
    ['git --exec-path /tmp push', ['push?']],
    ['/usr/bin/git commit -m x', ['commit']],
    ['sudo git push', ['push']],
    ['env GIT_AUTHOR_NAME=x git commit -m x', ['commit']],
    ['command git commit -m x', ['commit']],
    ['cd sub && git push', ['push?']],
    ['git -C sub push', ['push?']],
    ['cd sub && git commit -m x', ['commit?']],
    ['echo hi; git commit -m x', ['commit']],
    ['bash -lc "git commit -m x"', ['commit']],
    ["sh -c 'git push'", ['push']],
    ['eval "git push"', ['push']],
    ['git commit -m x && git push', ['commit', 'push']],
    ['"git" push', ['push']],
    ['git "commit" -m x', ['commit']],
  ])('%s', (cmd, expected) => {
    expect(actions(cmd)).toEqual(expected);
  });

  it.each([
    ['echo "git push"'],
    ["echo 'git commit -m x'"],
    ['git status'],
    ['git log --oneline'],
    ['git commit-tree abc123'],
    ['ls -la'],
    [''],
  ])('does not flag %s', (cmd) => {
    expect(actions(cmd)).toEqual([]);
  });
});

describe('parseGitActions: what a commit includes', () => {
  it.each([
    ['git commit -m "a b c"', ['commit']],
    ['git commit -F msg.txt', ['commit']],
    ['git commit -am "msg"', ['commit+tracked']],
    ['git commit -a -m msg', ['commit+tracked']],
    ['git commit --all -m msg', ['commit+tracked']],
    ['git commit -m msg src/a.ts', ['commit+tracked']],
    ['git commit -m msg -- src/a.ts', ['commit+tracked']],
    ['git commit --amend --no-edit', ['commit']],
  ])('%s', (cmd, expected) => {
    expect(actions(cmd)).toEqual(expected);
  });
});

describe('parseGitActions: fail closed when it cannot read the command', () => {
  it('treats nesting too deep to inspect as an uncertain history mutation', () => {
    expect(actions('eval eval eval eval eval git push')).toEqual(['commit+tracked?']);
  });
});

describe('vendored parser', () => {
  it('is byte-identical to sdlc-guard\'s command-parser (below the vendoring header)', () => {
    const original = readFileSync(new URL('../../sdlc-guard/policies/command-parser.ts', import.meta.url), 'utf8');
    const vendored = readFileSync(new URL('../policies/command-parser.ts', import.meta.url), 'utf8');
    expect(vendored.endsWith(original)).toBe(true);
  });
});
