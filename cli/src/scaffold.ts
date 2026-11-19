/**
 * `kit scaffold` — generate standardized engineering artifacts from
 * templates. Refuses to overwrite without --force (exit 1).
 */

import * as fs from "fs";
import * as path from "path";
import { IO } from "./report";
import { adrTemplate, planTemplate, specTemplate } from "./templates";
import { createKitDirs, initProfile, StackId } from "./init";
import { ProjectMode } from "./profile";

export type ScaffoldKind = "spec" | "plan" | "adr" | "profile";
export const SCAFFOLD_KINDS: ScaffoldKind[] = ["spec", "plan", "adr", "profile"];

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ScaffoldReport {
  status: "created" | "exists" | "error";
  kind: ScaffoldKind;
  path: string | null;
  next: string | null;
  message?: string;
}

export function nextAdrNumber(root: string): number {
  const dir = path.join(root, "docs", "architecture", "adr");
  if (!fs.existsSync(dir)) return 1;
  let max = 0;
  for (const entry of fs.readdirSync(dir)) {
    const m = /^(\d{3,})-.*\.md$/.exec(entry);
    if (m !== null) {
      const n = Number.parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** An existing ADR with this slug (e.g. `001-same-slug.md`), with its number, or null. */
export function findAdrBySlug(root: string, slug: string): { path: string; number: number } | null {
  const dir = path.join(root, "docs", "architecture", "adr");
  if (!fs.existsSync(dir)) return null;
  const re = new RegExp(`^(\\d{3,})-${escapeRegExp(slug)}\\.md$`);
  for (const entry of fs.readdirSync(dir)) {
    const m = re.exec(entry);
    if (m !== null) return { path: `docs/architecture/adr/${entry}`, number: Number.parseInt(m[1], 10) };
  }
  return null;
}

export function runScaffold(
  root: string,
  opts: { kind: string; slug?: string; force: boolean; json: boolean; mode?: string; stack?: string; io: IO }
): { exitCode: number; report: ScaffoldReport } {
  const io = opts.io;
  const kind = opts.kind;

  if (!SCAFFOLD_KINDS.includes(kind as ScaffoldKind)) {
    io.err(`kit scaffold: unknown artifact "${kind}" (allowed: ${SCAFFOLD_KINDS.join(", ")})`);
    if (opts.json) io.out(JSON.stringify({ status: "error", code: "UNKNOWN_KIND", kind }, null, 2));
    return { exitCode: 2, report: { status: "error", kind: kind as ScaffoldKind, path: null, next: null } };
  }

  // --- profile delegates to init logic ---
  if (kind === "profile") {
    if (opts.slug !== undefined) {
      io.err("kit scaffold: profile does not take a slug");
      if (opts.json) io.out(JSON.stringify({ status: "error", code: "USAGE", message: "profile does not take a slug" }, null, 2));
      return { exitCode: 2, report: { status: "error", kind, path: null, next: null } };
    }
    const result = initProfile(root, {
      mode: opts.mode as ProjectMode | undefined,
      stack: opts.stack as StackId | undefined,
      force: opts.force,
    });
    if (result.exitCode === 1) {
      io.err("kit scaffold: .ai/project.yml already exists — use --force to overwrite");
      if (opts.json) io.out(JSON.stringify({ status: "exists", kind, path: ".ai/project.yml", next: null }, null, 2));
      return { exitCode: 1, report: { status: "exists", kind, path: ".ai/project.yml", next: null } };
    }
    createKitDirs(root);
    const next = "kit verify";
    if (opts.json) {
      io.out(JSON.stringify({ status: "created", kind, path: ".ai/project.yml", next }, null, 2));
    } else {
      io.out(`Created .ai/project.yml`);
      io.out(`Next: ${next}`);
    }
    return { exitCode: 0, report: { status: "created", kind, path: ".ai/project.yml", next } };
  }

  // --- slug validation (prevents path traversal) ---
  const slug = opts.slug;
  if (slug === undefined || !SLUG_RE.test(slug) || slug.includes("..")) {
    io.err(`kit scaffold: invalid slug ${JSON.stringify(slug)} (use letters, digits, ".", "_" or "-")`);
    if (opts.json) io.out(JSON.stringify({ status: "error", code: "BAD_SLUG", slug: slug ?? null }, null, 2));
    return { exitCode: 2, report: { status: "error", kind: kind as ScaffoldKind, path: null, next: null } };
  }

  let template: { path: string; content: string };
  if (kind === "adr") {
    // an ADR with the same slug is the same artifact: refuse unless --force,
    // and with --force regenerate it under its existing number
    const existing = findAdrBySlug(root, slug);
    if (existing !== null && !opts.force) {
      io.err(`kit scaffold: ${existing.path} already exists — use --force to overwrite`);
      if (opts.json) io.out(JSON.stringify({ status: "exists", kind, path: existing.path, next: null }, null, 2));
      return { exitCode: 1, report: { status: "exists", kind: "adr", path: existing.path, next: null } };
    }
    const number = existing !== null ? existing.number : nextAdrNumber(root);
    template = adrTemplate(slug, number);
  } else {
    template = kind === "spec" ? specTemplate(slug) : planTemplate(slug);
  }

  const target = path.join(root, template.path);
  if (fs.existsSync(target) && !opts.force) {
    io.err(`kit scaffold: ${template.path} already exists — use --force to overwrite`);
    if (opts.json) io.out(JSON.stringify({ status: "exists", kind, path: template.path, next: null }, null, 2));
    return { exitCode: 1, report: { status: "exists", kind: kind as ScaffoldKind, path: template.path, next: null } };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, template.content, "utf8");

  const next =
    kind === "spec"
      ? `kit validate-spec ${template.path}`
      : kind === "plan"
        ? `kit validate-plan ${template.path}`
        : "link the ADR from related docs, then commit it";

  if (opts.json) {
    io.out(JSON.stringify({ status: "created", kind, path: template.path, next }, null, 2));
  } else {
    io.out(`Created ${template.path}`);
    io.out(`Next: ${next}`);
  }
  return { exitCode: 0, report: { status: "created", kind: kind as ScaffoldKind, path: template.path, next } };
}
