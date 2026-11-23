// packages/cli/src/commands/skills.ts
//
// `kit skills` — inspect and install the external agent-skills packs
// (ruby-agent-skills, node-agent-skills, react-agent-skills) that the kit
// integrates with its M14 stack packs and SDLC workflow stages.
//
// Subcommands:
//   kit skills                      list the integrated packs
//   kit skills show <pack>          details for one pack, incl. workflow map
//   kit skills for-stack <stack>    pack + recommendations for a kit stack
//   kit skills recommend --stack <stack> [--stage <stage>] [--json]
//   kit skills install <pack> [--dir <path>] [--into <dir>] [--ref <gitref>]
//                            [--force] [--dry-run] [--json]
//
// This command never bundles pack content: list/show/recommend work from the
// registry in @agentic-sdlc-kit/core, and install fetches the pack from its
// GitHub repository (see ./skills-install.ts).

import {
  WORKFLOW_STAGES,
  defaultSkillsPackForStack,
  listSkillsPacks,
  recommendSkillsByStage,
  recommendSkillsForStage,
  resolveSkillsPack,
  resolveStackPack,
  type WorkflowStage,
} from '@agentic-sdlc-kit/core';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command, CommandContext, CommandResult } from './types.js';
import { runSkillsInstall } from './skills-install.js';

function optValue(argv: ReadonlyArray<string>, name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  return value && !value.startsWith('-') ? value : undefined;
}

const hasFlag = (argv: ReadonlyArray<string>, name: string): boolean => argv.includes(name);

function formatList(): string {
  const lines: string[] = ['kit skills — integrated agent skills packs', ''];
  for (const pack of listSkillsPacks()) {
    lines.push(`  ${pack.id}`);
    lines.push(`    ${pack.description}`);
    lines.push(`    Repository: ${pack.repository} (${pack.skillCount} skills, MIT)`);
    lines.push('');
  }
  lines.push("Run 'kit skills show <pack>' for the workflow mapping.");
  lines.push("Run 'kit skills install <pack> --dir <project>' to install into a project.");
  lines.push('');
  return lines.join('\n');
}

function formatWorkflowMap(stackIds: readonly string[]): string {
  const lines: string[] = [`  Workflow mapping (stack: ${stackIds.join(', ')}):`];
  for (const stage of WORKFLOW_STAGES) {
    const skills = recommendSkillsForStage(stackIds[0]!, stage);
    lines.push(`    ${stage.padEnd(12)} ${skills.join(', ')}`);
  }
  return lines.join('\n');
}

function formatShow(packId: string): string {
  const pack = resolveSkillsPack(packId)!;
  const stackIds = ['node-typescript', 'react-typescript', 'ruby-rails', 'ruby'].filter(
    (s) => defaultSkillsPackForStack(s)?.id === pack.id,
  );
  const lines: string[] = [
    `kit skills show ${pack.id}`,
    '',
    `  Name:         ${pack.name}`,
    `  Description:  ${pack.description}`,
    `  Repository:   ${pack.url}`,
    `  Skills:       ${pack.skillCount}`,
    `  Categories:   ${pack.categories.join(', ')}`,
    `  License:      ${pack.license}`,
    `  Kit stacks:   ${stackIds.join(', ')}`,
    '',
    formatWorkflowMap(stackIds),
    '',
  ];
  return lines.join('\n');
}

function formatForStack(stackId: string): string {
  const pack = defaultSkillsPackForStack(stackId)!;
  const byStage = recommendSkillsByStage(stackId);
  const total = Object.values(byStage).reduce((n, skills) => n + skills.length, 0);
  const lines: string[] = [
    `kit skills for-stack ${stackId}`,
    '',
    `  Pack:         ${pack.id} (${pack.repository})`,
    `  Recommended:  ${total} skill(s) across ${WORKFLOW_STAGES.length} workflow stages`,
    '',
    formatWorkflowMap([stackId]),
    '',
  ];
  return lines.join('\n');
}

function formatRecommend(stackId: string, stage: string | undefined, isJson: boolean): string {
  if (stage) {
    const skills = recommendSkillsForStage(stackId, stage as WorkflowStage);
    if (isJson) {
      return JSON.stringify({ stack: stackId, stage, skills }, null, 2) + '\n';
    }
    return [
      `kit skills recommend --stack ${stackId} --stage ${stage}`,
      '',
      ...skills.map((s) => `  ${s}`),
      '',
    ].join('\n');
  }
  const byStage = recommendSkillsByStage(stackId);
  if (isJson) {
    return JSON.stringify({ stack: stackId, stages: byStage }, null, 2) + '\n';
  }
  const lines: string[] = [`kit skills recommend --stack ${stackId}`, ''];
  for (const s of WORKFLOW_STAGES) {
    lines.push(`  ${s.padEnd(12)} ${byStage[s].join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatSkillsHelp(): string {
  return [
    'Usage: kit skills [list | show <pack> | for-stack <stack> | recommend | install <pack>]',
    '',
    'Inspect and install the external agent-skills packs integrated with the kit.',
    '',
    'Subcommands:',
    '  list                        List the integrated packs (default)',
    '  show <pack>                 Pack details and its workflow mapping',
    '  for-stack <stack>           Pack and recommendations for a kit stack',
    '  recommend --stack <stack>   Skills to load per SDLC stage (--stage to filter, --json for machines)',
    '  install <pack>              Install a pack into a project',
    '',
    'Install options:',
    '  --dir <path>     Project directory (default: current directory)',
    '  --into <dir>     Target skills directory (default: .claude/skills)',
    '  --ref <gitref>   Clone a specific branch or tag (default: repository HEAD)',
    '  --source <dir>   Install from a local checkout of the pack instead of GitHub',
    '  --force          Overwrite already-installed skills',
    '  --dry-run        Preview without cloning or writing',
    '  --json           Machine-readable output',
    '',
    'Stacks with a pack: node-typescript, react-typescript, ruby-rails, ruby.',
    'Install target: skills are copied to <project>/.claude/skills/<skill>/SKILL.md',
    'and recorded in <project>/.ai-kit/skills-manifest.json.',
    '',
  ].join('\n');
}

export const skillsCommand: Command = {
  name: 'skills',
  summary: 'Inspect and install external agent skills packs (ruby/node/react).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    const argv = ctx.argv;
    if (argv.includes('--help') || argv.includes('-h')) {
      ctx.stdout(formatSkillsHelp());
      return { exitCode: 0 };
    }
    const rest = argv.filter((a) => !['list'].includes(a));
    const sub = rest.find((a) => !a.startsWith('-')) ?? 'list';

    if (sub === 'list') {
      ctx.stdout(formatList());
      return { exitCode: 0 };
    }
    if (sub === 'show') {
      const packId = rest.find((a) => a !== 'show' && !a.startsWith('-'));
      const pack = packId ? resolveSkillsPack(packId) : undefined;
      if (!pack) {
        ctx.stderr(`kit skills: unknown skills pack '${packId ?? '(missing)'}'\n`);
        return { exitCode: 1, message: 'unknown or missing pack id' };
      }
      ctx.stdout(formatShow(pack.id));
      return { exitCode: 0 };
    }
    if (sub === 'for-stack') {
      const stackId = rest.find((a) => a !== 'for-stack' && !a.startsWith('-'));
      if (!stackId || !resolveStackPack(stackId)) {
        ctx.stderr(
          `kit skills: unknown stack '${stackId ?? '(missing)'}'. Known stacks: node-typescript, react-typescript, ruby-rails, ruby, python, go\n`,
        );
        return { exitCode: 1, message: 'unknown or missing stack id' };
      }
      if (!defaultSkillsPackForStack(stackId)) {
        ctx.stderr(`kit skills: no skills pack covers stack '${stackId}' yet\n`);
        return { exitCode: 1, message: `no pack for stack: ${stackId}` };
      }
      ctx.stdout(formatForStack(stackId));
      return { exitCode: 0 };
    }
    if (sub === 'recommend') {
      const stackId = optValue(rest, '--stack');
      const stage = optValue(rest, '--stage');
      if (!stackId || !defaultSkillsPackForStack(stackId)) {
        ctx.stderr(
          `kit skills: recommend requires --stack with a pack-covered stack (node-typescript, react-typescript, ruby-rails, ruby)\n`,
        );
        return { exitCode: 1, message: 'missing or unsupported --stack' };
      }
      if (stage && !(WORKFLOW_STAGES as readonly string[]).includes(stage)) {
        ctx.stderr(`kit skills: unknown stage '${stage}'. Stages: ${WORKFLOW_STAGES.join(', ')}\n`);
        return { exitCode: 1, message: `unknown stage: ${stage}` };
      }
      ctx.stdout(formatRecommend(stackId, stage, hasFlag(rest, '--json')));
      return { exitCode: 0 };
    }
    if (sub === 'install') {
      const packId = rest.find((a) => a !== 'install' && !a.startsWith('-'));
      if (!packId) {
        ctx.stderr(
          'kit skills: install requires a pack id (ruby-agent-skills, node-agent-skills, react-agent-skills)\n',
        );
        return { exitCode: 1, message: 'missing pack id' };
      }
      const dirArg = optValue(rest, '--dir');
      const targetRoot = path.resolve(ctx.cwd, dirArg ?? '.');
      const stat = await fs.stat(targetRoot).catch(() => null);
      if (!stat?.isDirectory()) {
        ctx.stderr(`kit skills: target directory does not exist: ${targetRoot}\n`);
        return { exitCode: 1, message: `target directory not found: ${targetRoot}` };
      }
      return runSkillsInstall(
        {
          packId,
          targetRoot,
          into: optValue(rest, '--into'),
          ref: optValue(rest, '--ref'),
          source: optValue(rest, '--source'),
          force: hasFlag(rest, '--force'),
          dryRun: hasFlag(rest, '--dry-run'),
          json: hasFlag(rest, '--json'),
        },
        ctx,
      );
    }
    ctx.stderr(`kit skills: unknown subcommand '${sub}'\nRun 'kit skills --help' for usage.\n`);
    return { exitCode: 1, message: `unknown subcommand: ${sub}` };
  },
};
