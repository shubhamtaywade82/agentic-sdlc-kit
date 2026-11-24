// scripts/milestone-status.ts
//
// Keeps the milestone status table in RESEARCH.md honest.
//   tsx scripts/milestone-status.ts          prints the table
//   tsx scripts/milestone-status.ts --write  rewrites the block in RESEARCH.md
//   tsx scripts/milestone-status.ts --check  exits 1 if the block is stale or a claim is false
//
// Invariants enforced here, not by reviewers:
//   1. Every evidence path a milestone cites must exist in the repository.
//   2. A "not-started" milestone must cite no evidence at all: code without a
//      milestone claim is not a milestone, and a claim without code is a lie.
//   3. The table in RESEARCH.md must equal what this script generates.

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Status = 'partial' | 'not-started';

export interface Milestone {
  id: number;
  name: string;
  status: Status;
  evidence: string[];
  /** What is known to be missing. Required for every partial milestone. */
  gaps: string;
}

// Numbering follows the post-M7 sections of RESEARCH.md, which the code uses.
export const MILESTONES: readonly Milestone[] = [
  { id: 8, name: 'Greenfield application workflow', status: 'partial',
    evidence: ['packages/cli/src/commands/new.ts', 'packages/core/src/scaffolding/generator.ts'],
    gaps: 'no per-stack source templates; greenfield apps get ADR, profile and spec only' },
  { id: 9, name: 'Bug-fix and refactoring workflows', status: 'partial',
    evidence: ['packages/cli/src/commands/fix.ts', 'packages/core/src/workflows/feature-workflow.ts', 'packages/core/src/workflows/refactor/transitions.ts'],
    gaps: 'kit refactor and kit optimize are informational by design (ADR-0013); no end-to-end refactor run is wired' },
  { id: 10, name: 'Runtime governance Mod', status: 'partial',
    evidence: ['plugins/sdlc-guard/hooks/register.ts', 'plugins/sdlc-guard/policies/classify.ts'],
    gaps: 'passes claude plugin validate; not yet exercised in a live session' },
  { id: 11, name: 'Secret Guard Mod', status: 'partial',
    evidence: ['plugins/secret-guard/hooks/register.ts', 'plugins/secret-guard/policies/detect.ts'],
    gaps: 'passes claude plugin validate; core/contracts rule set lacks the plugin-only jwt and dhan rules' },
  { id: 12, name: 'Model and effort Router Mod', status: 'partial',
    evidence: ['plugins/model-router/hooks/register.ts', 'plugins/model-router/policies/router.ts'],
    gaps: 'suggest-only by default; no verification-driven escalation loop wired to real runs' },
  { id: 13, name: 'Run Observer Mod', status: 'partial',
    evidence: ['plugins/run-observer/hooks/register.ts', 'plugins/run-observer/policies/trace-store.ts'],
    gaps: 'in-memory trace store; no persisted run reports and no kit runs command' },
  { id: 14, name: 'Technology stack packs', status: 'partial',
    evidence: ['packages/core/src/stacks/stack-pack.ts'],
    gaps: 'pack commands drive kit new and kit init, verified end to end for Python, plain Ruby and Node; no real rails new app run' },
  { id: 15, name: 'CLI installer and plugin distribution', status: 'partial',
    evidence: ['packages/cli/src/commands/install.ts', 'packages/cli/src/commands/plugin-linker.ts'],
    gaps: 'full OS matrix not in CI' },
  { id: 16, name: 'CI/CD, compatibility and release engineering', status: 'partial',
    evidence: ['.github/workflows/ci.yml'],
    gaps: 'live-agent lane added but unverified; needs ANTHROPIC_API_KEY on main; no release workflow' },
  { id: 17, name: 'Security, reliability and production hardening', status: 'partial',
    evidence: ['docs/security/SECURITY.md'],
    gaps: 'threat model documented; no hardening tests' },
  { id: 18, name: 'Ecosystem integrations and extensibility', status: 'partial',
    evidence: ['packages/mod-sdk/src/index.ts'],
    gaps: 'MockRuntime mirrors the Mods contract; not checked against the live engine' },
  { id: 19, name: 'Evaluation and benchmarking framework', status: 'partial',
    evidence: ['packages/core/src/learning/evaluation-metrics.ts'],
    gaps: 'metric definitions only; no benchmark corpus' },
  { id: 20, name: 'Team and organization governance', status: 'not-started', evidence: [], gaps: '' },
  { id: 21, name: 'Real-world adoption and pilot program', status: 'not-started', evidence: [], gaps: '' },
  { id: 22, name: 'Operational excellence', status: 'not-started', evidence: [], gaps: '' },
  { id: 23, name: 'Developer experience and usability', status: 'not-started', evidence: [], gaps: '' },
  { id: 24, name: 'Ecosystem and marketplace governance', status: 'not-started', evidence: [], gaps: '' },
  { id: 25, name: 'Enterprise readiness', status: 'not-started', evidence: [], gaps: '' },
  { id: 26, name: 'Continuous product intelligence and evolution', status: 'not-started', evidence: [], gaps: '' },
  { id: 27, name: 'Architecture and governance for self-evolution', status: 'partial',
    evidence: ['docs/adr/ADR-0016-self-evolution-engine-separate-subsystem.md', 'docs/adr/ADR-0017-two-learning-loops.md'],
    gaps: 'ADRs only' },
  { id: 28, name: 'Experience collection', status: 'partial',
    evidence: ['packages/core/src/learning/experience-collector.ts'],
    gaps: 'in-memory collector; not wired to any command' },
  { id: 29, name: 'Hierarchical memory', status: 'partial',
    evidence: ['packages/core/src/learning/memory-store.ts', 'packages/cli/src/commands/memory.ts'],
    gaps: 'store and query exist; no populated memory from real runs' },
  { id: 30, name: 'Knowledge distillation', status: 'partial',
    evidence: ['packages/core/src/learning/distiller.ts'],
    gaps: 'distiller logic only; no real input' },
  { id: 31, name: 'Improvement hypothesis engine', status: 'partial',
    evidence: ['packages/core/src/learning/hypothesis-engine.ts'], gaps: 'no real experiments' },
  { id: 32, name: 'Evolution Lab', status: 'partial',
    evidence: ['packages/core/src/learning/evolution-lab.ts'], gaps: 'no protected benchmark corpus' },
  { id: 33, name: 'Controlled promotion', status: 'partial',
    evidence: ['packages/core/src/learning/promotion-gate.ts'], gaps: 'gate logic only; never run on a real proposal' },
  { id: 34, name: 'Self-improvement evaluation', status: 'not-started', evidence: [], gaps: '' },
  { id: 35, name: 'Continuous meta-evolution', status: 'not-started', evidence: [], gaps: '' },
];

export const START = '<!-- milestone-status:start -->';
export const END = '<!-- milestone-status:end -->';

export interface Problem {
  milestone: number;
  message: string;
}

export function validate(root: string, milestones: readonly Milestone[]): Problem[] {
  const problems: Problem[] = [];
  for (const m of milestones) {
    if (m.status === 'not-started' && m.evidence.length > 0) {
      problems.push({ milestone: m.id, message: 'marked not-started but cites evidence' });
    }
    if (m.status === 'partial' && m.gaps.trim() === '') {
      problems.push({ milestone: m.id, message: 'partial without a stated gap' });
    }
    for (const rel of m.evidence) {
      if (!existsSync(path.join(root, rel))) {
        problems.push({ milestone: m.id, message: `evidence path missing: ${rel}` });
      }
    }
  }
  return problems;
}

export function renderTable(milestones: readonly Milestone[]): string {
  const rows = milestones.map((m) => {
    const label = m.status === 'partial' ? 'partial' : 'not started';
    const evidence = m.evidence.length === 0 ? '—' : m.evidence.map((e) => `\`${e}\``).join('<br>');
    return `| M${m.id} | ${m.name} | ${label} | ${evidence} | ${m.gaps || '—'} |`;
  });
  return [
    '| Milestone | Name | Status | Evidence | Known gaps |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function spliceBlock(doc: string, table: string): string | null {
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a === -1 || b === -1 || b < a) return null;
  return `${doc.slice(0, a + START.length)}\n${table}\n${doc.slice(b)}`;
}

async function main(): Promise<number> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const mode = process.argv[2] ?? '--print';
  const problems = validate(root, MILESTONES);
  for (const p of problems) console.error(`M${p.milestone}: ${p.message}`);
  if (problems.length > 0) return 1;

  const table = renderTable(MILESTONES);
  if (mode === '--print') {
    console.log(table);
    return 0;
  }
  const docPath = path.join(root, 'RESEARCH.md');
  const doc = await fs.readFile(docPath, 'utf8');
  const spliced = spliceBlock(doc, table);
  if (spliced === null) {
    console.error(`RESEARCH.md is missing the ${START} / ${END} markers`);
    return 1;
  }
  if (mode === '--write') {
    await fs.writeFile(docPath, spliced, 'utf8');
    console.log('RESEARCH.md milestone table updated');
    return 0;
  }
  if (mode === '--check') {
    if (spliced !== doc) {
      console.error('RESEARCH.md milestone table is stale: run `pnpm run milestones:write`');
      return 1;
    }
    console.log(`milestone table OK (${MILESTONES.length} milestones)`);
    return 0;
  }
  console.error(`unknown mode ${mode}`);
  return 2;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
