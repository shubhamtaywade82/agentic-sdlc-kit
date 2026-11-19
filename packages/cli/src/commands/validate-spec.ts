// packages/cli/src/commands/validate-spec.ts
//
// `kit validate-spec [path] [--json]`.
// Validates a feature specification against schema, acceptance criteria, and scope rules.

import path from "node:path";
import { loadSpecification } from "@agentic-sdlc-kit/core";
import type { FeatureSpecification } from "@agentic-sdlc-kit/contracts";
import type { Command, CommandContext, CommandResult } from "./types.js";

export const validateSpecCommand: Command = {
  name: "validate-spec",
  summary: "Validate a feature specification against schema, quality, and risk invariants.",
  async run(ctx: CommandContext): Promise<CommandResult> {
    if (ctx.argv.includes("--help") || ctx.argv.includes("-h")) {
      ctx.stdout(formatHelp());
      return { exitCode: 0 };
    }

    const isJson = ctx.argv.includes("--json");
    const targetArg = ctx.argv.find((a) => !a.startsWith("-"));
    const targetPath = path.resolve(ctx.cwd, targetArg ?? "docs/specifications");

    const res = await loadSpecification(targetPath);
    if (!res.ok) {
      if (isJson) {
        ctx.stdout(JSON.stringify({ valid: false, error: res.error }, null, 2) + "\n");
      } else {
        ctx.stderr(`kit validate-spec: FAIL: ${res.error.message}\n`);
      }
      return { exitCode: 1, message: res.error.message };
    }

    if (isJson) {
      ctx.stdout(JSON.stringify({ valid: true, specification: res.value }, null, 2) + "\n");
    } else {
      ctx.stdout(formatSuccessSummary(res.value));
    }
    return { exitCode: 0 };
  },
};

function formatSuccessSummary(spec: FeatureSpecification): string {
  const lines: string[] = [
    `kit validate-spec: PASS`,
    `Feature:       ${spec.id} - ${spec.title}`,
    `Scope:         ${spec.scope.in.length} in-scope, ${spec.scope.out.length} out-of-scope`,
    `Requirements:  ${spec.functionalRequirements.length} functional, ${spec.nonFunctionalRequirements.length} non-functional`,
    `Acceptance:    ${spec.acceptanceCriteria.length} criteria defined`,
    `Risks:         ${spec.risks.length} analyzed (${spec.risks.filter((r) => r.severity === "high").length} high)`,
    `Open Questions:${spec.openQuestions.length} (${spec.openQuestions.filter((q) => !q.resolved).length} unresolved)`,
  ];
  return lines.join("\n") + "\n";
}

function formatHelp(): string {
  return [
    "Usage: kit validate-spec [path] [--json]",
    "",
    "Validate a feature specification (SPEC.md or JSON) for structural completeness,",
    "scope boundaries, ID uniqueness, and risk governance.",
    "",
    "Options:",
    "  --json    Output machine-readable validation result",
    "  --help    Show this message",
    "",
  ].join("\n");
}
