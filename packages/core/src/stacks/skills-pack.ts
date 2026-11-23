// packages/core/src/stacks/skills-pack.ts
//
// Skills-pack registry: integrates the three external agent-skills packs
// (ruby-agent-skills, node-agent-skills, react-agent-skills) with the kit's
// stack packs (M14) and SDLC workflow stages.
//
// Each pack is a GitHub repository of Agent Skills in the open agentskills
// format: `skills/<name>/SKILL.md` with YAML frontmatter (name, description,
// license). The registry is pure data plus lookup functions — no I/O — so it
// stays inside the core architectural invariant (core imports only from
// contracts, and this module imports nothing at all).
//
// It provides three things:
//   1. Pack sources: where each pack lives, its size, and its categories.
//   2. Stack mapping: which pack serves each kit stack id (M14 stack packs).
//   3. Workflow mapping: which concrete skills an agent should load for each
//      SDLC stage (requirements, spec, plan, tdd, verify, review, fix,
//      refactor, release) on each mapped stack, so `kit skills recommend`
//      can point an agent at exactly the right expertise before it starts.

export interface SkillsPackSource {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** GitHub repository as "owner/repo". */
  readonly repository: string;
  /** Canonical repository URL. */
  readonly url: string;
  /** Directory inside the repository that holds the skills. */
  readonly skillsPath: string;
  /** Number of skills (directories containing SKILL.md) measured 2026-11-23. */
  readonly skillCount: number;
  /** Coarse content categories, derived from skill-name prefixes. */
  readonly categories: readonly string[];
  readonly license: string;
}

export const RUBY_SKILLS_PACK: SkillsPackSource = {
  id: 'ruby-agent-skills',
  name: 'Ruby Agent Skills',
  description:
    'Rails and Ruby engineering expertise: 50 rails-* framework skills, 28 ruby-* language ' +
    'skills, the planning-* spec/ticket workflow family, code review, RuboCop, and the ' +
    'stack-minimality audit family.',
  repository: 'shubhamtaywade82/ruby-agent-skills',
  url: 'https://github.com/shubhamtaywade82/ruby-agent-skills',
  skillsPath: 'skills',
  skillCount: 104,
  categories: ['rails', 'ruby', 'planning', 'code-review', 'rubocop', 'stack-minimality'],
  license: 'MIT',
};

export const NODE_SKILLS_PACK: SkillsPackSource = {
  id: 'node-agent-skills',
  name: 'Node.js Agent Skills',
  description:
    'Node.js and TypeScript backend engineering expertise: runtime foundations, API and HTTP ' +
    'engineering, data and messaging patterns, security, observability, reliability, operations, ' +
    'and the node-agent-* process family (safety, handoff, recovery, verification).',
  repository: 'shubhamtaywade82/node-agent-skills',
  url: 'https://github.com/shubhamtaywade82/node-agent-skills',
  skillsPath: 'skills',
  skillCount: 340,
  categories: [
    'runtime',
    'architecture',
    'api',
    'data',
    'security',
    'testing',
    'observability',
    'resilience',
    'operations',
    'agent-process',
  ],
  license: 'MIT',
};

export const REACT_SKILLS_PACK: SkillsPackSource = {
  id: 'react-agent-skills',
  name: 'React Agent Skills',
  description:
    'React and frontend engineering expertise: component and hooks engineering, state and data ' +
    'fetching libraries (Redux, TanStack, Zustand, Apollo), routing, styling, accessibility, ' +
    'performance, testing tooling, plus frontend-* platform skills and deployment targets.',
  repository: 'shubhamtaywade82/react-agent-skills',
  url: 'https://github.com/shubhamtaywade82/react-agent-skills',
  skillsPath: 'skills',
  skillCount: 127,
  categories: [
    'react',
    'frontend',
    'typescript',
    'state-and-data',
    'testing',
    'tooling',
    'deployment',
    'agent-process',
  ],
  license: 'MIT',
};

const SKILLS_PACKS: ReadonlyMap<string, SkillsPackSource> = new Map([
  [RUBY_SKILLS_PACK.id, RUBY_SKILLS_PACK],
  [NODE_SKILLS_PACK.id, NODE_SKILLS_PACK],
  [REACT_SKILLS_PACK.id, REACT_SKILLS_PACK],
]);

/**
 * Kit stack id -> default skills pack id. Mirrors the M14 stack packs:
 * `node-typescript` and `react-typescript` and the Ruby family map to their
 * language packs; python and go have no published pack yet and stay absent.
 */
const STACK_TO_PACK: ReadonlyMap<string, string> = new Map([
  ['node-typescript', NODE_SKILLS_PACK.id],
  ['react-typescript', REACT_SKILLS_PACK.id],
  ['ruby-rails', RUBY_SKILLS_PACK.id],
  ['ruby', RUBY_SKILLS_PACK.id],
]);

/** SDLC stages `kit skills recommend` can map to concrete skills. */
export const WORKFLOW_STAGES = [
  'requirements',
  'spec',
  'plan',
  'tdd',
  'verify',
  'review',
  'fix',
  'refactor',
  'release',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

/**
 * Stage -> stack id -> skills to load from that stack's pack. Every skill
 * name was verified to exist in its pack on 2026-11-23. Skills are loaded
 * on demand; the kit never bundles pack content.
 */
const WORKFLOW_SKILLS: Readonly<
  Record<WorkflowStage, Readonly<Record<string, readonly string[]>>>
> = {
  requirements: {
    'ruby-rails': ['planning-interview', 'planning-wayfinder'],
    ruby: ['planning-interview', 'planning-wayfinder'],
    'node-typescript': ['node-task-decomposition'],
    'react-typescript': ['frontend-risk-classification'],
  },
  spec: {
    'ruby-rails': ['planning-spec'],
    ruby: ['planning-spec'],
    'node-typescript': ['node-implementation-planning'],
    'react-typescript': ['agent-workflow'],
  },
  plan: {
    'ruby-rails': ['planning-tickets'],
    ruby: ['planning-tickets'],
    'node-typescript': ['node-change-impact-analysis', 'node-module-boundaries'],
    'react-typescript': ['frontend-architecture', 'frontend-monorepo'],
  },
  tdd: {
    'ruby-rails': ['ruby-tdd-refactoring', 'rails-test-engineering'],
    ruby: ['ruby-tdd-refactoring'],
    'node-typescript': ['node-testing', 'node-test-isolation-engineering'],
    'react-typescript': ['react-testing-engineering', 'testing-library'],
  },
  verify: {
    'ruby-rails': ['rails-test-engineering', 'rubocop'],
    ruby: ['rubocop'],
    'node-typescript': ['node-native-test-runner', 'node-integration-testing'],
    'react-typescript': ['frontend-test-reliability', 'vitest'],
  },
  review: {
    'ruby-rails': ['ai-code-review', 'change-review'],
    ruby: ['change-review'],
    'node-typescript': ['node-code-review', 'node-review-feedback'],
    'react-typescript': ['react-review', 'react-architecture'],
  },
  fix: {
    'ruby-rails': ['ruby-debugging'],
    ruby: ['ruby-debugging'],
    'node-typescript': ['node-debugging', 'node-repository-forensics'],
    'react-typescript': ['frontend-debugging'],
  },
  refactor: {
    'ruby-rails': ['ruby-clean-code', 'ruby-service-objects'],
    ruby: ['ruby-clean-code'],
    'node-typescript': ['node-refactoring', 'node-legacy-modernization'],
    'react-typescript': ['frontend-codemod-migration', 'react-compiler'],
  },
  release: {
    'ruby-rails': ['rails-release-engineering'],
    ruby: ['rails-release-engineering'],
    'node-typescript': ['node-release-engineering', 'node-npm-publishing'],
    'react-typescript': ['frontend-production', 'github-pages'],
  },
};

export function resolveSkillsPack(id: string): SkillsPackSource | undefined {
  return SKILLS_PACKS.get(id);
}

export function listSkillsPacks(): SkillsPackSource[] {
  return Array.from(SKILLS_PACKS.values());
}

/** All packs whose content applies to the given kit stack id. */
export function skillsPacksForStack(stackId: string): SkillsPackSource[] {
  const packId = STACK_TO_PACK.get(stackId);
  return packId ? [SKILLS_PACKS.get(packId)!] : [];
}

/** The default pack for a stack, or undefined when no pack covers it. */
export function defaultSkillsPackForStack(stackId: string): SkillsPackSource | undefined {
  return skillsPacksForStack(stackId)[0];
}

/** Stage-specific skill recommendations for a stack; empty for unknown input. */
export function recommendSkillsForStage(stackId: string, stage: WorkflowStage): readonly string[] {
  return WORKFLOW_SKILLS[stage]?.[stackId] ?? [];
}

/** Recommendations for every stage at once, ordered by WORKFLOW_STAGES. */
export function recommendSkillsByStage(
  stackId: string,
): Readonly<Record<WorkflowStage, readonly string[]>> {
  const result = {} as Record<WorkflowStage, readonly string[]>;
  for (const stage of WORKFLOW_STAGES) {
    result[stage] = recommendSkillsForStage(stackId, stage);
  }
  return result;
}
