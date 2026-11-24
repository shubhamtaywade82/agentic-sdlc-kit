// packages/cli/src/commands/skills-install-report.ts
//
// Human- and machine-facing result formatting for `kit skills install`.
// Text output keeps the original layout (Target / Installed / Skipped) and
// adds Refused for directories --force declined to touch because the kit
// did not install them.

import type { SkillInstallStatus } from './skills-install-manifest.js';

export function formatResult(
  packName: string,
  into: string,
  statuses: SkillInstallStatus[],
  manifestPath: string,
): string {
  const installed = statuses.filter((s) => s.status === 'installed');
  const skipped = statuses.filter((s) => s.status === 'skipped-existing');
  const refused = statuses.filter((s) => s.status === 'skipped-unowned');
  const lines: string[] = [`kit skills install: SUCCESS (${packName})`];
  lines.push(`  Target:       ${into}`);
  lines.push(`  Installed:    ${installed.length} skill(s)`);
  for (const s of installed) lines.push(`    + ${s.name}`);
  if (skipped.length > 0) {
    lines.push(`  Skipped:      ${skipped.length} existing skill(s) (use --force to overwrite)`);
    for (const s of skipped) lines.push(`    ~ ${s.name}`);
  }
  if (refused.length > 0) {
    lines.push(
      `  Refused:      ${refused.length} unowned skill(s) (--force replaces only kit-installed skills)`,
    );
    for (const s of refused) lines.push(`    ! ${s.name}`);
  }
  lines.push(`  Manifest:     ${manifestPath}`);
  lines.push('');
  return lines.join('\n');
}

export interface DryRunPlan {
  pack: string;
  repository: string;
  ref: string;
  target: string;
  expectedSkills: number;
  dryRun: boolean;
}

export function formatDryRun(plan: DryRunPlan): string {
  const lines: string[] = [
    'kit skills install --dry-run',
    `  Pack:         ${plan.pack}`,
    `  Repository:   ${plan.repository}`,
    `  Ref:          ${plan.ref}`,
    `  Target:       ${plan.target}`,
    `  Expected:     ${plan.expectedSkills} skill(s) from pack metadata`,
    '',
    'No files written and no repository cloned. Run without --dry-run to execute.',
    '',
  ];
  return lines.join('\n');
}
