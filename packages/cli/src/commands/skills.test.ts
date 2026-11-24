// packages/cli/src/commands/skills.test.ts
//
// `kit skills` — list/show/recommend run from the core registry with no I/O;
// install is exercised against a local --source fixture so the suite never
// needs network access. The GitHub clone path is the same code with the
// source lookup replaced by `git clone`.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir, type TempDir } from '@agentic-sdlc-kit/testing';
import { runSkillsInstall } from './skills-install.js';
import { skillsCommand } from './skills.js';
import type { CommandContext } from './types.js';

const makeCtx = (
  argv: ReadonlyArray<string>,
  cwd = '/tmp',
): CommandContext & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return { argv, cwd, stdout: (s) => void out.push(s), stderr: (s) => void err.push(s), out, err };
};

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false,
  );

describe('kit skills list/show/recommend', () => {
  it('lists the three integrated packs with repositories and counts', async () => {
    const ctx = makeCtx([]);
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    const text = ctx.out.join('');
    expect(text).toContain('ruby-agent-skills');
    expect(text).toContain('node-agent-skills');
    expect(text).toContain('react-agent-skills');
    expect(text).toContain('shubhamtaywade82/node-agent-skills');
    expect(text).toContain('340 skills');
  });

  it('shows one pack with its workflow mapping', async () => {
    const ctx = makeCtx(['show', 'ruby-agent-skills']);
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    const text = ctx.out.join('');
    expect(text).toContain('https://github.com/shubhamtaywade82/ruby-agent-skills');
    expect(text).toContain('ruby-rails');
    expect(text).toContain('planning-spec');
    expect(text).toContain('rails-release-engineering');
  });

  it('fails show for an unknown pack', async () => {
    const ctx = makeCtx(['show', 'nope-pack']);
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/unknown skills pack/);
  });

  it('maps a kit stack to its pack and recommendations', async () => {
    const ctx = makeCtx(['for-stack', 'ruby-rails']);
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    const text = ctx.out.join('');
    expect(text).toContain('ruby-agent-skills');
    expect(text).toContain('planning-tickets');
  });

  it('fails for-stack for stacks without a pack', async () => {
    const ctx = makeCtx(['for-stack', 'python']);
    expect((await skillsCommand.run(ctx)).exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/no skills pack covers stack 'python'/);
  });

  it('recommends stage skills for a stack, in text and JSON', async () => {
    const text = makeCtx(['recommend', '--stack', 'node-typescript', '--stage', 'tdd']);
    expect((await skillsCommand.run(text)).exitCode).toBe(0);
    expect(text.out.join('')).toContain('node-testing');

    const json = makeCtx([
      'recommend',
      '--stack',
      'node-typescript',
      '--stage',
      'review',
      '--json',
    ]);
    expect((await skillsCommand.run(json)).exitCode).toBe(0);
    const parsed = JSON.parse(json.out.join('')) as {
      stack: string;
      stage: string;
      skills: string[];
    };
    expect(parsed.stack).toBe('node-typescript');
    expect(parsed.stage).toBe('review');
    expect(parsed.skills).toContain('node-code-review');
  });

  it('rejects unknown stacks and stages for recommend', async () => {
    const badStack = makeCtx(['recommend', '--stack', 'python']);
    expect((await skillsCommand.run(badStack)).exitCode).toBe(1);
    const badStage = makeCtx(['recommend', '--stack', 'ruby', '--stage', 'deploy']);
    expect((await skillsCommand.run(badStage)).exitCode).toBe(1);
    expect(badStage.err.join('')).toMatch(/unknown stage 'deploy'/);
  });

  it('rejects unknown subcommands and prints usage on --help', async () => {
    const bogus = makeCtx(['teleport']);
    expect((await skillsCommand.run(bogus)).exitCode).toBe(1);
    const help = makeCtx(['--help']);
    expect((await skillsCommand.run(help)).exitCode).toBe(0);
    expect(help.out.join('')).toContain('Usage: kit skills');
  });
});

describe('kit skills install', () => {
  let project: TempDir;
  let source: TempDir;

  const makeSourceSkill = async (name: string): Promise<void> => {
    const dir = path.join(source.path, 'skills', name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: fixture skill for tests\nlicense: MIT\n---\n\n# ${name}\n`,
      'utf8',
    );
  };

  beforeEach(async () => {
    project = await makeTempDir('kit-skills-project-');
    source = await makeTempDir('kit-skills-source-');
    await makeSourceSkill('alpha-one');
    await makeSourceSkill('beta-two');
  });
  afterEach(async () => {
    await project.cleanup();
    await source.cleanup();
  });

  const installArgv = (extra: string[] = []): string[] => [
    'install',
    'node-agent-skills',
    '--dir',
    project.path,
    '--source',
    source.path,
    ...extra,
  ];

  it('dry-run plans without cloning or writing anything', async () => {
    const ctx = makeCtx(installArgv(['--dry-run', '--json']));
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    const plan = JSON.parse(ctx.out.join('')) as { dryRun: boolean; expectedSkills: number };
    expect(plan.dryRun).toBe(true);
    expect(plan.expectedSkills).toBe(340);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
    expect(await exists(path.join(project.path, '.ai-kit'))).toBe(false);
  });

  it('copies skills into .claude/skills and records the manifest', async () => {
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(
      await exists(path.join(project.path, '.claude', 'skills', 'alpha-one', 'SKILL.md')),
    ).toBe(true);
    expect(await exists(path.join(project.path, '.claude', 'skills', 'beta-two', 'SKILL.md'))).toBe(
      true,
    );
    const manifestRaw = await fs.readFile(
      path.join(project.path, '.ai-kit', 'skills-manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as {
      packs: Record<
        string,
        { skills: Array<{ name: string; status: string }> }
      >;
    };
    expect(manifest.packs['node-agent-skills'].repository).toBe(
      'shubhamtaywade82/node-agent-skills',
    );
    expect(manifest.packs['node-agent-skills'].skills).toHaveLength(2);
    expect(ctx.out.join('')).toContain('Installed:    2 skill(s)');
  });

  it('is idempotent: a second run skips existing skills unless --force', async () => {
    await skillsCommand.run(makeCtx(installArgv()));
    const second = makeCtx(installArgv());
    expect((await skillsCommand.run(second)).exitCode).toBe(0);
    expect(second.out.join('')).toContain('Skipped:      2 existing skill(s)');

    const forced = makeCtx(installArgv(['--force']));
    expect((await skillsCommand.run(forced)).exitCode).toBe(0);
    expect(forced.out.join('')).toContain('Installed:    2 skill(s)');
  });

  it('installs into a custom --into directory', async () => {
    const ctx = makeCtx(installArgv(['--into', 'docs/agent-skills']));
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(
      await exists(path.join(project.path, 'docs', 'agent-skills', 'alpha-one', 'SKILL.md')),
    ).toBe(true);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
  });

  it('fails for an unknown pack and for a missing --dir', async () => {
    const badPack = makeCtx(['install', 'nope-pack', '--dir', project.path]);
    expect((await skillsCommand.run(badPack)).exitCode).toBe(1);
    const badDir = makeCtx([
      'install',
      'node-agent-skills',
      '--dir',
      path.join(project.path, 'missing'),
    ]);
    expect((await skillsCommand.run(badDir)).exitCode).toBe(1);
    expect(badDir.err.join('')).toMatch(/target directory does not exist/);
  });
});

describe('kit skills install security (fail-closed installer)', () => {
  let project: TempDir;
  let source: TempDir;

  const makeSourceSkill = async (name: string, frontmatterName?: string): Promise<void> => {
    const dir = path.join(source.path, 'skills', name);
    await fs.mkdir(dir, { recursive: true });
    const fm = frontmatterName ?? name;
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${fm}\ndescription: fixture skill for tests\n---\n\n# ${name}\n`,
      'utf8',
    );
  };

  beforeEach(async () => {
    project = await makeTempDir('kit-skills-sec-project-');
    source = await makeTempDir('kit-skills-sec-source-');
    await makeSourceSkill('alpha-one');
    await makeSourceSkill('beta-two');
  });
  afterEach(async () => {
    await project.cleanup();
    await source.cleanup();
  });

  const installArgv = (extra: string[] = []): string[] => [
    'install',
    'node-agent-skills',
    '--dir',
    project.path,
    '--source',
    source.path,
    ...extra,
  ];

  const manifestPath = (): string => path.join(project.path, '.ai-kit', 'skills-manifest.json');

  const readManifest = async (): Promise<{
    packs: Record<string, { skills: Array<{ name: string; status: string }> }>;
  }> => JSON.parse(await fs.readFile(manifestPath(), 'utf8'));

  it('rejects --into that escapes or equals the project directory', async () => {
    for (const into of ['../../outside', '/etc', '.']) {
      const ctx = makeCtx(installArgv(['--into', into]));
      const r = await skillsCommand.run(ctx);
      expect(r.exitCode).toBe(1);
      expect(ctx.err.join('')).toMatch(/--into/);
    }
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
  });

  it('validates the install target even for --dry-run', async () => {
    const ctx = makeCtx(installArgv(['--dry-run', '--into', '../escape']));
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/escapes the project directory/);
  });

  it('refuses to install through a symlinked destination component', async () => {
    const outside = await makeTempDir('kit-skills-outside-');
    await fs.mkdir(path.join(outside.path, 'skills'), { recursive: true });
    await fs.symlink(path.join(outside.path, 'skills'), path.join(project.path, '.claude'));
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/symlinked path component/);
    expect(await exists(path.join(outside.path, 'skills', 'alpha-one'))).toBe(false);
    await outside.cleanup();
  });

  it('fails closed on a corrupt manifest and never overwrites it', async () => {
    const corrupt = '{ this is not json';
    await fs.mkdir(path.join(project.path, '.ai-kit'), { recursive: true });
    await fs.writeFile(manifestPath(), corrupt, 'utf8');
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/not valid JSON/);
    expect(ctx.err.join('')).toMatch(/refuses to overwrite/);
    expect(await fs.readFile(manifestPath(), 'utf8')).toBe(corrupt);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
  });

  it('fails closed on a manifest with an unexpected shape', async () => {
    const wrong = JSON.stringify({ schemaVersion: 2, packs: {} });
    await fs.mkdir(path.join(project.path, '.ai-kit'), { recursive: true });
    await fs.writeFile(manifestPath(), wrong, 'utf8');
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/unexpected shape/);
    expect(await fs.readFile(manifestPath(), 'utf8')).toBe(wrong);
  });

  it('--force never replaces or deletes directories the kit did not install', async () => {
    const userSkill = path.join(project.path, '.claude', 'skills', 'alpha-one');
    await fs.mkdir(userSkill, { recursive: true });
    await fs.writeFile(path.join(userSkill, 'SKILL.md'), 'user-authored content\n', 'utf8');
    const ctx = makeCtx(installArgv(['--force']));
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(0);
    expect(ctx.out.join('')).toContain('Refused:      1 unowned skill(s)');
    expect(await fs.readFile(path.join(userSkill, 'SKILL.md'), 'utf8')).toBe(
      'user-authored content\n',
    );
    expect(await exists(path.join(project.path, '.claude', 'skills', 'beta-two', 'SKILL.md'))).toBe(
      true,
    );
  });

  it('--force replaces kit-installed skills; ownership survives idempotent re-runs', async () => {
    await skillsCommand.run(makeCtx(installArgv()));
    const skillMd = path.join(project.path, '.claude', 'skills', 'alpha-one', 'SKILL.md');
    await fs.appendFile(skillMd, 'user drift\n', 'utf8');

    // Idempotent re-run must not lose ownership of previously installed skills.
    await skillsCommand.run(makeCtx(installArgv()));
    const afterSkip = await readManifest();
    expect(afterSkip.packs['node-agent-skills'].skills).toContainEqual({
      name: 'alpha-one',
      status: 'installed',
    });

    const forced = makeCtx(installArgv(['--force']));
    expect((await skillsCommand.run(forced)).exitCode).toBe(0);
    expect(forced.out.join('')).toContain('Installed:    2 skill(s)');
    expect(await fs.readFile(skillMd, 'utf8')).not.toContain('user drift');
  });

  it('rejects symlinked content inside a skill before writing anything', async () => {
    const target = await makeTempDir('kit-skills-linktarget-');
    await fs.writeFile(path.join(target.path, 'payload.txt'), 'x', 'utf8');
    await fs.symlink(target.path, path.join(source.path, 'skills', 'alpha-one', 'link'));
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/symlink in pack content/);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
    await target.cleanup();
  });

  it('rejects a symlinked skill directory at the pack skills/ root', async () => {
    const elsewhere = await makeTempDir('kit-skills-elsewhere-');
    await fs.mkdir(path.join(elsewhere.path, 'nested'), { recursive: true });
    await fs.symlink(elsewhere.path, path.join(source.path, 'skills', 'linked-skill'));
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/symlinked entry in pack skills/);
    await elsewhere.cleanup();
  });

  it('rejects SKILL.md without valid frontmatter or with a name mismatch', async () => {
    await fs.writeFile(
      path.join(source.path, 'skills', 'alpha-one', 'SKILL.md'),
      '# just markdown, no frontmatter\n',
      'utf8',
    );
    const noFm = makeCtx(installArgv());
    expect((await skillsCommand.run(noFm)).exitCode).toBe(1);
    expect(noFm.err.join('')).toMatch(/no YAML frontmatter/);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);

    await makeSourceSkill('alpha-one', 'wrong-name');
    const mismatch = makeCtx(installArgv());
    expect((await skillsCommand.run(mismatch)).exitCode).toBe(1);
    expect(mismatch.err.join('')).toMatch(/does not match its directory/);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
  });

  it('rejects unsafe skill directory names in a pack', async () => {
    await makeSourceSkill('weird skill');
    const ctx = makeCtx(installArgv());
    const r = await skillsCommand.run(ctx);
    expect(r.exitCode).toBe(1);
    expect(ctx.err.join('')).toMatch(/unsafe skill directory name/);
    expect(await exists(path.join(project.path, '.claude'))).toBe(false);
  });
});

describe('kit skills install (runSkillsInstall)', () => {
  let project: TempDir;

  beforeEach(async () => {
    project = await makeTempDir('kit-skills-run-');
  });
  afterEach(async () => {
    await project.cleanup();
  });

  it('returns JSON with per-skill statuses', async () => {
    const source = await makeTempDir('kit-skills-jsonsrc-');
    const dir = path.join(source.path, 'skills', 'gamma-three');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      '---\nname: gamma-three\ndescription: x\n---\n',
      'utf8',
    );
    const ctx = makeCtx([]);
    const r = await runSkillsInstall(
      {
        packId: 'react-agent-skills',
        targetRoot: project.path,
        force: false,
        dryRun: false,
        json: true,
        source: source.path,
      },
      ctx,
    );
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(ctx.out.join('')) as {
      installed: boolean;
      pack: string;
      skills: Array<{ name: string; status: string }>;
    };
    expect(parsed.installed).toBe(true);
    expect(parsed.pack).toBe('react-agent-skills');
    expect(parsed.skills).toEqual([{ name: 'gamma-three', status: 'installed' }]);
    await source.cleanup();
  });
});
