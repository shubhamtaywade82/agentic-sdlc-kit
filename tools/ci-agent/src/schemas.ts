// tools/ci-agent/src/schemas.ts
//
// Zod contracts for the two agent payloads (README invariant 3: parse
// failures abort the run). The JSON shapes are embedded verbatim in the
// system prompts — Ollama Cloud rejects the wire `format` parameter, so the
// contract rides in the prompt text and zod enforces it on the way out.

import { z } from 'zod';

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ReviewResult = z.object({
  summary: z.string().min(1).max(2_000),
  findings: z
    .array(
      z.object({
        severity: z.enum(SEVERITIES),
        file: z.string().min(1).max(300),
        line: z.number().int().positive().max(1_000_000).optional(),
        title: z.string().min(1).max(120),
        detail: z.string().min(1).max(1_000),
        suggestion: z.string().max(1_000).optional(),
      }),
    )
    .max(30),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const MAX_EDIT_FILES = 5;
export const MAX_EDIT_BYTES = 60_000;
export const MAX_TOTAL_EDITS = 8;

export const FixProposal = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(1).max(4_000),
  edits: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        explanation: z.string().min(1).max(1_000),
        // Search/replace on existing files only: oldString must be non-empty
        // (a blank oldString would mean "create file", which the bounded
        // write policy does not grant).
        oldString: z.string().min(1).max(MAX_EDIT_BYTES),
        newString: z.string().max(MAX_EDIT_BYTES),
      }),
    )
    .max(MAX_TOTAL_EDITS),
});
export type FixProposal = z.infer<typeof FixProposal>;

/** JSON contract embedded in the review system prompt. */
export const REVIEW_JSON_CONTRACT = `Return ONLY a single JSON object, no prose, no markdown fences, exactly this shape:
{"summary": string (1-2000 chars, your overall assessment of the change),
 "findings": array of 0-30 objects, each exactly:
   {"severity": "critical" | "high" | "medium" | "low" | "info",
    "file": string (a path that appears in the provided diff),
    "line": integer > 0 (a RIGHT-side line number visible in that file's diff, omit if unsure),
    "title": string (1-120 chars),
    "detail": string (1-1000 chars, citing the specific code you saw),
    "suggestion": string (optional, 1-1000 chars)}}`;

/** JSON contract embedded in the autofix system prompt. */
export const FIX_JSON_CONTRACT = `Return ONLY a single JSON object, no prose, no markdown fences, exactly this shape:
{"title": string (3-120 chars, conventional-commit style, what the repair does),
 "body": string (1-4000 chars, what failed and why this change repairs it),
 "edits": array of 0-5 objects, each exactly:
   {"path": string (one of the file paths you were shown),
    "explanation": string (1-1000 chars, why this exact edit),
    "oldString": string (1-60000 chars, text that currently exists EXACTLY ONCE in that file — copy it verbatim, including indentation and line breaks),
    "newString": string (0-60000 chars, the replacement text)}}
Return "edits": [] when you cannot confidently repair the failure — never guess.`;
