// ai-dev-kit SDLC MCP server.
//
// A stdio Model Context Protocol server that exposes the kit's SDLC
// knowledge (stages, workflows, templates, checklists, approval gates) to
// any MCP client: Claude Code, Cursor, Windsurf, VS Code Copilot, Gemini CLI.
// Read-only: no filesystem access, no network, no side effects.
//
// Protocol: https://modelcontextprotocol.io
// stdio rule: never write to stdout (it carries JSON-RPC); logs go to stderr.

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { APPROVAL_GATES, CHECKLISTS, MODES, STAGES, TEMPLATES } from "./data.js";

const SERVER_NAME = "ai-dev-kit-sdlc";
const SERVER_VERSION = "5.0.0";

const stageIds = STAGES.map((s) => s.id) as [string, ...string[]];
const templateNames = Object.keys(TEMPLATES) as [string, ...string[]];
const checklistNames = Object.keys(CHECKLISTS) as [string, ...string[]];

function text(markdown: string) {
  return { content: [{ type: "text" as const, text: markdown }] };
}

function findStage(id: string) {
  return STAGES.find((s) => s.id === id);
}

function createServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "sdlc_stages",
    {
      description:
        "List the 10 SDLC lifecycle stages (v5) with inputs, outputs, and the gate " +
        "that must pass before moving on, plus the three execution modes. " +
        "Use when planning how to approach a change.",
      inputSchema: z.object({}),
    },
    async () => {
      const rows = STAGES.map(
        (s) =>
          `| ${s.id} | ${s.name} | ${s.input} -> ${s.output} | Gate: ${s.gate} |`,
      );
      const modes = MODES.map((m) => `- **${m.name}**: ${m.stages}\n  Rule: ${m.rule}`);
      return text(
        [
          "## SDLC stages (v5)",
          "",
          "| Stage | Name | Input -> Output | Gate |",
          "|---|---|---|---|",
          ...rows,
          "",
          "## Execution modes",
          "",
          ...modes,
          "",
          "Deterministic gates (kit CLI): validate-spec, validate-plan, verify, audit, release-check. " +
            "Full docs live in .ai/workflows/ when the kit is installed. " +
            "Remote/release actions always need explicit human approval: " +
            APPROVAL_GATES.join("; ") + ".",
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "sdlc_workflow",
    {
      description:
        "Get the full workflow for one SDLC stage: goal, steps, and exit gate. " +
        "Use when entering a stage to learn its procedure.",
      inputSchema: z.object({
        stage: z
          .enum(stageIds)
          .describe("Stage id, e.g. 05-development or 08-release"),
      }),
    },
    async ({ stage }) => {
      const s = findStage(stage);
      if (!s) {
        return { content: [{ type: "text" as const, text: `Unknown stage '${stage}'.` }], isError: true };
      }
      return text(
        [
          `## ${s.id} — ${s.name}`,
          "",
          `- Input: ${s.input}`,
          `- Output: ${s.output}`,
          `- Exit gate: ${s.gate}`,
          `- Full doc (if the kit is installed): ${s.doc}`,
          "",
          "### Steps",
          ...s.steps.map((step, i) => `${i + 1}. ${step}`),
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "sdlc_next_stage",
    {
      description:
        "Given the current stage, return the next stage, its input, and its gate. " +
        "Use when a stage's exit gate has passed.",
      inputSchema: z.object({
        stage: z.enum(stageIds).describe("The stage that just finished"),
      }),
    },
    async ({ stage }) => {
      const idx = STAGES.findIndex((s) => s.id === stage);
      if (idx === -1) {
        return { content: [{ type: "text" as const, text: `Unknown stage '${stage}'.` }], isError: true };
      }
      const next = STAGES[idx + 1];
      if (!next) {
        return text(
          `'${stage}' is the last stage. Operations is continuous: monitor signals, run postmortems after incidents, and feed findings back into specs, checklists, and the resilience backlog.`,
        );
      }
      return text(
        [
          `Next stage: ${next.id} — ${next.name}`,
          "",
          `- Entry input: ${next.input}`,
          `- Exit gate: ${next.gate}`,
          `- Steps: ${next.steps.map((s) => s.split(":")[0]).join(" -> ")}`,
          "",
          `Full workflow: sdlc_workflow with stage '${next.id}'.`,
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "sdlc_template",
    {
      description:
        "Get a markdown template for a lifecycle artifact: feature spec, implementation " +
        "plan, PRD, tech spec, pull request, ADR, bug report, or changelog entry.",
      inputSchema: z.object({
        template: z.enum(templateNames).describe("spec | plan | prd | tech_spec | pr | adr | bug_report | changelog"),
      }),
    },
    async ({ template }) => {
      const t = TEMPLATES[template];
      if (!t) {
        return { content: [{ type: "text" as const, text: `Unknown template '${template}'.` }], isError: true };
      }
      return text(`## ${t.title}\n\n${t.description}\n\n\`\`\`markdown\n${t.content}\`\`\``);
    },
  );

  server.registerTool(
    "sdlc_checklist",
    {
      description:
        "Get a review checklist: definition-of-done, code-review, security, " +
        "performance, or release. Use when verifying work before finishing.",
      inputSchema: z.object({
        checklist: z
          .enum(checklistNames)
          .describe("definition-of-done | code-review | security | performance | release"),
      }),
    },
    async ({ checklist }) => {
      const c = CHECKLISTS[checklist];
      if (!c) {
        return { content: [{ type: "text" as const, text: `Unknown checklist '${checklist}'.` }], isError: true };
      }
      return text(
        [
          `## ${c.title}`,
          "",
          c.description,
          "",
          ...c.items.map((item) => `- [ ] ${item}`),
        ].join("\n"),
      );
    },
  );

  return server;
}

serveStdio(createServer, {
  onerror: (error) => console.error(`${SERVER_NAME}:`, error),
});
console.error(`${SERVER_NAME} v${SERVER_VERSION} serving SDLC tools on stdio`);
