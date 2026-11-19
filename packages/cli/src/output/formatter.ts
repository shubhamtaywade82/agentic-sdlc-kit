// packages/cli/src/output/formatter.ts
//
// Minimal output formatter. M1 keeps this trivial; later milestones add
// structured JSON output and machine-readable formats.

export function formatLine(label: string, value: string, status?: "ok" | "fail"): string {
  const tag = status === "ok" ? "[ok]" : status === "fail" ? "[FAIL]" : "";
  const pad = " ".repeat(Math.max(0, 14 - label.length));
  return `  ${label}${pad}${value}${tag ? `  ${tag}` : ""}`;
}
