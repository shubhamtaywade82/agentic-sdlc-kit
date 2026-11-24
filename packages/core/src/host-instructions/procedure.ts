// packages/core/src/host-instructions/procedure.ts
//
// The standing procedure that makes an AI host drive the kit autonomously.
// Installed ONCE per host (see targets.ts); per ticket the user then types one
// line. Everything here restates verified kit behavior and nothing else:
//   - the machine (`kit next --json`) decides the next action, not prose;
//   - Red advances only on an ASSERTION failure (missing module, compile error,
//     no tests found and timeouts are rejected);
//   - defects run through the same evidence-gated engine: `kit fix <BUG-NNN> ...`
//     delegates to `kit feature`, so Green is refused until Red was observed.

/** Short root-instruction block (WORKFLOWS §9C: root files stay short). */
export function protocolBlock(host: string): string {
  return [
    'All code changes go through the agentic-sdlc-kit. Never claim done from your own output.',
    `Declare your identity with KIT_HOST=${host} on every kit invocation.`,
    '',
    '1. Baseline: `kit doctor` and `kit verify` must pass before you change anything.',
    '2. Ticket IDs are <WORD>-<NNN> with at least 3 digits (normalize ABC-12 to ABC-012).',
    '   Author docs/specifications/features/<ID>/SPEC.md (H1 `# <ID>: <Title>`, non-empty',
    '   In Scope and Out of Scope, concrete ACC-NNN criteria) and docs/plans/<ID>/plan.json',
    '   (small TASK-NNN slices, each with a task-scoped verification.command argv array).',
    '   Run `kit validate-spec` and `kit validate-plan`. If requirements are ambiguous run',
    '   `kit elicit <ID>` and wait for the human; never assume blocking answers.',
    '3. `kit feature <ID> start`, then loop `kit next --json`: perform requiredAction, run the',
    '   reported nextInvocation, repeat until requiredAction is run.completed.',
    '   - red: stub the target module returning a wrong value, then write the failing test.',
    '     The failure MUST be an assertion; never a missing module, compile error or missing file.',
    '   - green: the minimum code that passes. - refactor: behavior-preserving only.',
    '   On ANY rejection: stop, report classification and reason, fix the cause. Never bypass a gate.',
    '4. At run.completed: `kit journal <ID> --verify` and `kit verify`; report the evidence chain.',
    '5. Defects: same loop with a BUG-NNN id (`kit fix BUG-NNN <phase>` is the same engine as',
    '   `kit feature`); the regression test must fail as an assertion first.',
    '   Never combine a fix with a refactor.',
    'Never edit .ai-kit/state or .ai-kit/journal. No unrelated changes.',
  ].join('\n');
}

const COMMON_TAIL = [
  'The kit gates decide completion, never your own output. Declare KIT_HOST=claude-code.',
  'If anything below is ambiguous, ask me; do not guess blocking answers.',
].join('\n');

export function featurePrompt(): string {
  return [
    '---',
    'description: Implement a story/feature through the agentic-sdlc-kit evidence gates',
    'argument-hint: <TICKET-ID> <story text / acceptance criteria>',
    '---',
    'Implement $ARGUMENTS through the agentic-sdlc-kit.',
    COMMON_TAIL,
    '',
    protocolBlock('claude-code'),
  ].join('\n');
}

export function fixPrompt(): string {
  return [
    '---',
    'description: Fix a defect through the agentic-sdlc-kit evidence gates (regression test first)',
    'argument-hint: <BUG-ID> <expected vs actual behavior>',
    '---',
    'Fix $ARGUMENTS through the agentic-sdlc-kit.',
    COMMON_TAIL,
    'Spec = expected vs actual behavior with a single regression task; smallest correction;',
    'no drive-by refactoring; unrelated baseline failures: stop and report.',
    '',
    protocolBlock('claude-code'),
  ].join('\n');
}

export function resumePrompt(): string {
  return [
    '---',
    'description: Resume an existing agentic-sdlc-kit run from its recorded phase',
    'argument-hint: <TICKET-ID>',
    '---',
    'Run `kit feature $ARGUMENTS status` and `kit next --json`, then continue the loop from the',
    'reported phase until run.completed. Never restart the run or discard evidence.',
    COMMON_TAIL,
    'End with `kit journal $ARGUMENTS --verify` and `kit verify`.',
  ].join('\n');
}

export function skillBody(host: string, name: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: Use whenever implementing a feature or story ticket, or fixing a bug, in a',
    '  kit-onboarded repository. Drives the kit next --json evidence-gated TDD loop and never',
    '  self-reports completion.',
    '---',
    '',
    protocolBlock(host),
  ].join('\n');
}
