// packages/core/src/elicitation/question-bank.ts
//
// Requirements elicitation questions. A blocking question must be answered by
// a person before the spec can advance. A non-blocking question may instead be
// recorded as an explicit assumption, so the record shows what was assumed.
// Stack-scoped questions only apply when that stack is in the project.

export type QuestionStack = 'ruby-rails' | 'node-typescript' | 'react-typescript' | 'python' | 'go';

export interface Question {
  id: string;
  prompt: string;
  /** Closed answer set. Empty means free text. */
  options: readonly string[];
  blocking: boolean;
  /** Undefined means the question applies to every stack. */
  stacks?: readonly QuestionStack[];
  /** Why the answer matters; shown to the person answering. */
  why: string;
}

export const QUESTION_BANK: readonly Question[] = [
  {
    id: 'users',
    prompt: 'Who are the primary users of this feature?',
    options: [],
    blocking: true,
    why: 'Acceptance criteria and authorization are derived from the users.',
  },
  {
    id: 'done',
    prompt: 'What observable outcome defines done for this feature?',
    options: [],
    blocking: true,
    why: 'Without a testable outcome the TDD loop has nothing to fail against.',
  },
  {
    id: 'data-sensitivity',
    prompt: 'Which kind of data does this feature read or write?',
    options: ['none', 'internal', 'personal-data', 'payment-data', 'credentials'],
    blocking: true,
    why: 'Sensitive data triggers a security review and secret-guard scrutiny.',
  },
  {
    id: 'auth-change',
    prompt: 'Does this feature change authentication or authorization?',
    options: ['no', 'yes'],
    blocking: true,
    why: 'Auth changes need explicit threat review before implementation.',
  },
  {
    id: 'production-impact',
    prompt: 'Does this feature touch production traffic, data, or external systems?',
    options: ['no', 'yes'],
    blocking: true,
    why: 'Production impact changes the approval and rollback requirements.',
  },
  {
    id: 'rollback',
    prompt: 'How is a bad release of this feature rolled back?',
    options: ['revert-deploy', 'feature-flag', 'data-migration-reversal', 'not-reversible'],
    blocking: true,
    why: 'A non-reversible change needs a stricter release gate.',
  },
  {
    id: 'schema-change',
    prompt: 'Does this feature change the database schema?',
    options: ['none', 'additive', 'destructive'],
    blocking: true,
    stacks: ['ruby-rails', 'node-typescript', 'python'],
    why: 'Destructive migrations are blocked by sdlc-guard unless approved.',
  },
  {
    id: 'rails-surface',
    prompt: 'Is the user interface server-rendered (Hotwire) or a JSON API for a separate client?',
    options: ['hotwire', 'json-api', 'both'],
    blocking: true,
    stacks: ['ruby-rails'],
    why: 'The surface determines the request, system, and contract test layers.',
  },
  {
    id: 'node-framework',
    prompt: 'Which HTTP framework serves this feature?',
    options: ['express', 'fastify', 'nest', 'next', 'none'],
    blocking: true,
    stacks: ['node-typescript'],
    why: 'The framework fixes the routing, middleware, and test harness.',
  },
  {
    id: 'api-compat',
    prompt: 'Is there an existing public API or client that must not break?',
    options: ['no', 'yes'],
    blocking: false,
    why: 'Breaking changes need a versioning plan; otherwise an assumption is recorded.',
  },
  {
    id: 'latency-target',
    prompt: 'Is there a latency or throughput target for this feature?',
    options: ['none', 'defined'],
    blocking: false,
    why: 'A defined target becomes a performance test in verification.',
  },
  {
    id: 'observability',
    prompt: 'What must be logged or measured after release?',
    options: [],
    blocking: false,
    why: 'Missing telemetry is the most common reason a release cannot be diagnosed.',
  },
  {
    id: 'react-state',
    prompt: 'Where does this feature keep client state?',
    options: ['local-component', 'shared-store', 'server-state-cache'],
    blocking: false,
    stacks: ['react-typescript'],
    why: 'The state location decides the test strategy for components.',
  },
];
