/**
 * @agentic-mods/sdlc-bridge — The ONLY package that coordinates @agentic-sdlc-kit/core. Starts/resumes workflows, requests transitions, runs verification, evaluates policies, and publishes normalized events to the mod event bus.
 *
 * Implementation status: scaffold. The next milestone wires these interfaces to
 * the real agentic-sdlc-kit workflow / TDD / verification / policy APIs.
 */
import type { VerificationReport, WorkflowRun } from "@agentic-sdlc-kit/contracts";

/**
 * Scaffold stand-in: @agentic-sdlc-kit/contracts does not yet export a
 * ProjectState type. TODO(marketplace-m2): replace with the contracts type.
 */
export interface ProjectState {
  root: string;
  profileLoaded: boolean;
}

export const packageId = "@agentic-mods/sdlc-bridge";

export interface SdlcBridge {
  initializeProject(root: string): Promise<BridgeResult<ProjectState>>;
  startWorkflow(request: StartWorkflowRequest): Promise<BridgeResult<WorkflowRun>>;
  transition(request: WorkflowTransitionRequest): Promise<BridgeResult<TransitionDecision>>;
  verify(request: VerificationRequest): Promise<BridgeResult<VerificationReport>>;
  evaluatePolicy(request: PolicyEvaluationRequest): Promise<BridgeResult<PolicyDecision>>;
}

export interface BridgeResult<T> {
  ok: boolean;
  value?: T;
  errorCode?: "CONTRACT_INVALID" | "VERIFICATION_FAILED" | "APPROVAL_REQUIRED" | "POLICY_VIOLATION";
  message?: string;
}

// The request/response shapes below are scaffold placeholders; the next
// milestone maps them onto the real @agentic-sdlc-kit/core APIs.

export interface StartWorkflowRequest {
  workflowId: string;
  repositoryRoot: string;
  input?: Record<string, unknown>;
}

export interface WorkflowTransitionRequest {
  runId: string;
  fromStage: string;
  toStage: string;
  reason?: string;
}

export interface TransitionDecision {
  allowed: boolean;
  reason?: string;
}

export interface VerificationRequest {
  runId: string;
  checks: Array<"build" | "test" | "lint" | "typecheck" | "security">;
}

export interface PolicyEvaluationRequest {
  runId: string;
  policyId: string;
  context?: Record<string, unknown>;
}

export interface PolicyDecision {
  decision: "allow" | "ask" | "deny";
  policyId: string;
  reason?: string;
}
