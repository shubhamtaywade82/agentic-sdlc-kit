// packages/claude-code-adapter/src/mods/model-router.ts
//
// M12 Model and Effort Router Mod: routes tasks to optimal model tier based on
// task complexity, failure count, and security/architectural risk.

export type ModelTier = "haiku" | "sonnet" | "opus";
export type EffortLevel = "low" | "medium" | "high";

export interface TaskContext {
  readonly phase?: "discovery" | "spec" | "plan" | "tdd" | "verify" | "review";
  readonly risk?: "low" | "medium" | "high";
  readonly failureCount?: number;
  readonly isSecuritySensitive?: boolean;
}

export interface RoutingDecision {
  readonly model: ModelTier;
  readonly effort: EffortLevel;
  readonly rationale: string;
}

export class ModelRouter {
  route(ctx: TaskContext): RoutingDecision {
    const failures = ctx.failureCount ?? 0;

    if (failures >= 2 || ctx.isSecuritySensitive || ctx.phase === "plan" && ctx.risk === "high") {
      return {
        model: "opus",
        effort: "high",
        rationale: "Escalated to Opus: high risk, repeated verification failures, or complex planning",
      };
    }

    if (ctx.phase === "discovery" || (ctx.phase === "verify" && ctx.risk === "low")) {
      return {
        model: "haiku",
        effort: "low",
        rationale: "Routed to Haiku: read-only discovery or routine verification",
      };
    }

    const effort: EffortLevel = ctx.risk === "high" || failures > 0 ? "high" : "medium";
    return {
      model: "sonnet",
      effort,
      rationale: "Routed to Sonnet: standard engineering implementation and TDD cycle",
    };
  }
}
