// packages/core/src/discovery/repository-scanner.ts
//
// Interface for repository scanning. The M1 implementation is a no-op stub
// that returns a structured NOT_IMPLEMENTED error. M2 implements the real
// scanner; the contract is declared here so the core package has a stable
// target.
//
// INVARIANT (SECURITY.md §1, ADR-0009): scanning is read-only. The scanner
// MUST NOT execute any discovered script. The interface makes this
// impossible to violate by not exposing any execute method.

import {
  Errors,
  type RepositoryScan,
  type Result,
} from "@agentic-sdlc-kit/contracts";

export interface RepositoryScanner {
  /**
   * Scan the repository at `root`. Read-only. Returns a structured
   * RepositoryScan or a DISCOVERY_FAILED error.
   */
  scan(root: string): Promise<Result<RepositoryScan>>;
}

/**
 * M1 stub scanner. Returns NOT_IMPLEMENTED. M2 replaces this with the real
 * filesystem-backed scanner. The stub exists so the public surface is
 * stable and tests can exercise the failure path.
 */
export class StubRepositoryScanner implements RepositoryScanner {
  async scan(root: string): Promise<Result<RepositoryScan>> {
    return {
      ok: false,
      error: Errors.notImplemented(
        "RepositoryScanner is not implemented in M1; lands in M2",
        { root, milestone: "M2" },
      ),
    };
  }
}
