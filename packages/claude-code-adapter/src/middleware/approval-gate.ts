// packages/claude-code-adapter/src/middleware/approval-gate.ts
//
// Approval gate interface. The core's PolicyDecision is applied to the
// host via this middleware. In M1 this is an interface only; M10 wires
// the concrete implementation against the Claude Code approval API.
//
// INVARIANT (SECURITY.md §3.2, ADR-0009): a bypass that silently turns
// `deny` into `allow` is a Critical bug. The middleware MUST refuse to
// translate a `deny` into a host "allow" decision under any circumstance.

import type { PolicyDecision } from '@agentic-sdlc-kit/contracts';

/**
 * The host's view of an approval decision. The adapter maps a
 * PolicyDecision to one of these.
 */
export type HostApprovalDecision = 'allow' | 'deny' | 'prompt';

export interface ApprovalGate {
  /**
   * Apply a PolicyDecision to the host. Returns the host-side decision
   * the adapter should communicate.
   */
  apply(decision: PolicyDecision): HostApprovalDecision;
}

/**
 * M1 default gate. Maps:
//   - allow    → allow
//   - deny     → deny   (INVARIANT: never `allow`)
//   - require-approval → prompt (interactive) or deny (non-interactive)
 */
export class DefaultApprovalGate implements ApprovalGate {
  constructor(private readonly interactive: boolean = true) {}

  apply(decision: PolicyDecision): HostApprovalDecision {
    if (decision.verdict === 'allow') return 'allow';
    if (decision.verdict === 'deny') return 'deny';
    // require-approval
    return this.interactive ? 'prompt' : 'deny';
  }
}
