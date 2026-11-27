// packages/cli/src/commands/verify.ts
//
// `kit verify [path] [--dry-run] [--json] [--strength]`.
// Deterministic verification runner executing configured test, lint, and typecheck commands.
// `--strength` additionally runs the optional mutation-score stage (ADR-0022).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  parseProfileYaml,
  ProcessVerificationRunner,
  runStrengthCheck,
} from '@agentic-sdlc-kit/core';
import {
  DEFAULT_STRENGTH_SETTINGS,
  evaluateStrengthGate,
  type StrengthEvidence,
  type VerificationReport,
} from '@agentic-sdlc-kit/contracts';
import type { Command, CommandContext, CommandResult } from './types.js';

export const verifyCommand: Command = {
  name: 'verify',
  summary: 'Execute deterministic verification commands (tests, lint, typecheck, build).',
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes('--help') || ctx.argv.includes('-h')) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes('--json');
    const isDryRun = ctx.argv.includes('--dry-run');
    const withStrength = ctx.argv.includes('--strength');
    const targetArg = ctx.argv.find((a) => !a.startsWith('-'));
    const targetRoot = path.resolve(ctx.cwd, targetArg ?? '.');
    const profilePath = path.join(targetRoot, '.ai-kit', 'project.yml');

    let yamlContent: string;
    try {
      yamlContent = await fs.readFile(profilePath, 'utf8');
    } catch {
      const msg = `Profile not found at ${profilePath}. Run 'kit init' first.`;
      ctx.stderr(`kit verify: ${msg}\n`);
      return { exitCode: 1, message: msg };
    }

    const profileRes = parseProfileYaml(yamlContent);
    if (!profileRes.ok) {
      // Surface the structured issues (e.g. zod paths) when present — a
      // bare "failed schema validation" with no reasons hides the cause.
      const issues = profileRes.error.details?.issues;
      let msg = profileRes.error.message;
      if (Array.isArray(issues) && issues.length > 0) {
        const rendered = issues
          .map((i) => {
            const issue = i as { path?: unknown; message?: unknown };
            const at = typeof issue.path === 'string' && issue.path ? ` at '${issue.path}'` : '';
            return `${at}: ${String(issue.message ?? 'invalid')}`.trim();
          })
          .join('; ');
        msg = `${msg} (${rendered})`;
      }
      ctx.stderr(`kit verify: ${msg}\n`);
      return { exitCode: 1, message: msg };
    }

    const runner = new ProcessVerificationRunner();
    const repRes = await runner.run(profileRes.value, { cwd: targetRoot, dryRun: isDryRun });
    if (!repRes.ok) {
      ctx.stderr(`kit verify: runner error: ${repRes.error.message}\n`);
      return { exitCode: 1, message: repRes.error.message };
    }

    const report = repRes.value;

    // Optional strength stage (ADR-0022): `--strength` runs the mutation
    // tool under the profile's budget. Disabled-by-default stays honest —
    // the flag also honors an explicit profile `enabled: true` run.
    let strength: StrengthEvidence | undefined;
    let strengthBlocked = false;
    if (withStrength) {
      const settings = profileRes.value.verification?.strength ?? {
        ...DEFAULT_STRENGTH_SETTINGS,
        enabled: true, // explicit flag is the opt-in
      };
      const strengthRes = await runStrengthCheck({
        cwd: targetRoot,
        stack: profileRes.value.stack[0] ?? '',
        settings: { ...settings, enabled: true },
        scopeFiles: [],
      });
      if (!strengthRes.ok) {
        ctx.stderr(`kit verify --strength: ${strengthRes.error.message}\n`);
        return { exitCode: 1, message: strengthRes.error.message };
      }
      strength = strengthRes.value;
      strengthBlocked = evaluateStrengthGate(strength, settings.gateMode).block;
    }

    if (isJson) {
      const reportJson: Record<string, unknown> = { ...report };
      if (strength !== undefined) {
        reportJson['strength'] = strength;
      }
      ctx.stdout(JSON.stringify(reportJson, null, 2) + '\n');
    } else {
      ctx.stdout(formatReportSummary(report));
      if (strength !== undefined) ctx.stdout(formatStrengthSummary(strength));
    }

    const exitCode = report.status === 'passed' && !strengthBlocked ? 0 : 1;
    return { exitCode };
  },
};

function formatReportSummary(report: VerificationReport): string {
  const lines: string[] = [
    `Verification Run: ${report.runId}`,
    `Status:           ${report.status.toUpperCase()}`,
    `Checks:`,
  ];
  for (const c of report.checks) {
    const dur = c.durationMs !== undefined ? ` (${c.durationMs}ms)` : '';
    const cmdStr = c.command ? ` [${c.command.join(' ')}]` : '';
    lines.push(`  - ${c.id.padEnd(12)} ${c.status.toUpperCase()}${dur}${cmdStr}`);
  }
  if (report.checks.length === 0) {
    // Zero checks usually means the profile's commands were not parsed.
    // Surface the likely cause instead of a bare BLOCKED.
    lines.push('  (none configured)');
    lines.push('');
    lines.push('  No verification commands were found. Check that');
    lines.push('  .ai-kit/project.yml has a commands section, e.g.:');
    lines.push('    commands:');
    lines.push('      test:');
    lines.push("        - ['node', '--test']");
  }
  return lines.join('\n') + '\n';
}

function formatStrengthSummary(strength: StrengthEvidence): string {
  const score = strength.score !== undefined ? `${strength.score}%` : 'n/a';
  const lines: string[] = [
    `Strength:          ${strength.status.toUpperCase()} (score ${score} vs threshold ${strength.threshold}%)`,
    `  tool=${strength.tool} scope=${strength.scope} mutants=${strength.mutantsKilled}/${strength.mutantsGenerated} killed`,
    `  budget=${strength.budgetMs}ms duration=${strength.durationMs}ms`,
    `  ${strength.summary}`,
    '',
  ];
  return lines.join('\n') + '\n';
}

function formatHelp(): string {
  return [
    'Usage: kit verify [path] [--dry-run] [--json] [--strength]',
    '',
    'Execute deterministic verification checks configured in .ai-kit/project.yml.',
    'Commands run with shell: false and bounded timeouts.',
    '',
    'Options:',
    '  --dry-run   Mark checks as skipped without executing processes',
    '  --json      Output full machine-readable VerificationReport',
    '  --strength  Additionally run the mutation-score stage (ADR-0022);',
    '              budgeted by verification.strength.budgetMs; exit 1 when',
    '              gateMode enforce and below threshold',
    '  --help      Show this message',
    '',
  ].join('\n');
}
