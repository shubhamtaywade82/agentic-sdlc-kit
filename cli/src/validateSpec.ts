/**
 * `kit validate-spec` — deterministic spec structure validation.
 *
 * Draft specs downgrade the [soft] checks (Non-functional Requirements and
 * Open Questions presence) to warnings; approved specs treat them as errors.
 */

import * as fs from "fs";
import * as path from "path";
import { IO, Issue } from "./report";
import {
  extractFrontmatter,
  findHeadings,
  Heading,
  headingByTitle,
  itemText,
  listItems,
  MdLine,
  sectionLines,
  toLines,
} from "./markdown";
import { parseYaml, YamlMap, YamlParseError } from "./yaml";

export interface SpecReport {
  status: "passed" | "failed";
  summary: { errors: number; warnings: number; acceptanceCriteria: number };
  errors: Issue[];
  warnings: Issue[];
}

const AC_RE = /GIVEN|WHEN|THEN|should|must/i;
const SPEC_MODES = ["feature", "app", "fix"];
const SPEC_STATUSES = ["draft", "approved"];

function nonEmpty(lines: MdLine[]): boolean {
  return lines.some((ln) => ln.text.trim().length > 0);
}

export function runValidateSpec(
  root: string,
  fileArg: string,
  opts: { json: boolean; io: IO }
): { exitCode: number; report: SpecReport } {
  const io = opts.io;
  const file = path.resolve(root, fileArg);

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    io.err(`kit validate-spec: file not found: ${fileArg}`);
    if (opts.json) {
      io.out(JSON.stringify({ status: "error", code: "FILE_NOT_FOUND", file: fileArg }, null, 2));
    }
    return {
      exitCode: 2,
      report: { status: "failed", summary: { errors: 0, warnings: 0, acceptanceCriteria: 0 }, errors: [], warnings: [] },
    };
  }

  const text = fs.readFileSync(file, "utf8");
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (code: string, message: string, line?: number): void => {
    errors.push({ file: fileArg, line, code, message });
  };
  const warn = (code: string, message: string, line?: number): void => {
    warnings.push({ file: fileArg, line, code, message });
  };

  const fm = extractFrontmatter(text);
  let approved = false;

  // --- frontmatter ---
  const fmValue = validateFrontmatter(fm, err);
  if (fmValue !== null) {
    approved = fmValue.status === "approved";
  }

  const bodyLines = toLines(text).filter((ln) => ln.line >= fm.bodyStartLine);
  const headings = findHeadings(bodyLines);
  const h1 = headings.find((h) => h.level === 1);

  // --- H1 title ---
  if (h1 === undefined) {
    err("MISSING_H1", "spec must start with an H1 title (`# Title`)", fm.bodyStartLine);
  } else if (h1.line !== (headings[0] !== undefined ? headings[0].line : h1.line)) {
    err("MISSING_H1", "the first heading must be the H1 title", h1.line);
  }

  // --- required H2 sections ---
  const problem = headingByTitle(headings, 2, "Problem");
  if (problem === undefined) {
    err("MISSING_SECTION", 'required H2 section "Problem" is missing', h1 !== undefined ? h1.line : fm.bodyStartLine);
  } else if (!nonEmpty(sectionLines(problem, headings, bodyLines))) {
    err("EMPTY_SECTION", 'section "Problem" must contain a non-empty description', problem.line);
  }

  const scope = headingByTitle(headings, 2, "Scope");
  if (scope === undefined) {
    err("MISSING_SECTION", 'required H2 section "Scope" is missing', h1 !== undefined ? h1.line : fm.bodyStartLine);
  } else {
    validateScopeSection(scope, headings, bodyLines, err);
  }

  const ac = headingByTitle(headings, 2, "Acceptance Criteria");
  let acceptanceCriteria = 0;
  if (ac === undefined) {
    err("MISSING_SECTION", 'required H2 section "Acceptance Criteria" is missing', h1 !== undefined ? h1.line : fm.bodyStartLine);
  } else {
    const items = listItems(sectionLines(ac, headings, bodyLines));
    acceptanceCriteria = items.filter((ln) => AC_RE.test(itemText(ln))).length;
    if (acceptanceCriteria === 0) {
      err(
        "NO_ACCEPTANCE_CRITERIA",
        'section "Acceptance Criteria" needs at least one bullet matching /GIVEN|WHEN|THEN|should|must/i',
        ac.line
      );
    }
  }

  // --- soft sections: NFR + Open Questions ---
  const nfr = headingByTitle(headings, 2, "Non-functional Requirements");
  if (nfr === undefined) {
    const issue = (code: string, message: string, line?: number) =>
      approved ? err(code, message, line) : warn(code, message, line);
    issue(
      "MISSING_SECTION",
      'H2 section "Non-functional Requirements" is missing' + (approved ? "" : " (warning: spec is a draft)"),
      h1 !== undefined ? h1.line : fm.bodyStartLine
    );
  } else {
    const lines = sectionLines(nfr, headings, bodyLines);
    const body = lines.map((l) => l.text.trim()).join(" ").trim();
    if (body === "" || /^none\.?$/i.test(body)) {
      warn("NFR_EMPTY", 'section "Non-functional Requirements" is empty or "None" (info)', nfr.line);
    }
  }

  const oq = headingByTitle(headings, 2, "Open Questions");
  if (oq === undefined) {
    const issue = (code: string, message: string, line?: number) =>
      approved ? err(code, message, line) : warn(code, message, line);
    issue(
      "MISSING_SECTION",
      'H2 section "Open Questions" is missing' + (approved ? "" : " (warning: spec is a draft)"),
      h1 !== undefined ? h1.line : fm.bodyStartLine
    );
  } else {
    const items = listItems(sectionLines(oq, headings, bodyLines));
    if (items.length === 0) {
      warn("OPEN_QUESTIONS_EMPTY", 'section "Open Questions" is empty (info: resolve before implementation)', oq.line);
    }
  }

  const report: SpecReport = {
    status: errors.length > 0 ? "failed" : "passed",
    summary: { errors: errors.length, warnings: warnings.length, acceptanceCriteria },
    errors,
    warnings,
  };

  if (opts.json) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    io.out(`kit validate-spec — ${fileArg}`);
    io.out("");
    for (const e of errors) io.out(`  ERROR   ${formatLoc(e)}`);
    for (const w of warnings) io.out(`  WARNING ${formatLoc(w)}`);
    if (errors.length === 0 && warnings.length === 0) {
      io.out(`  OK — ${acceptanceCriteria} acceptance criterion/criteria`);
    }
    io.out("");
    io.out(
      errors.length > 0
        ? `FAILED (${errors.length} error(s), ${warnings.length} warning(s))`
        : `PASSED (${warnings.length} warning(s))`
    );
  }
  return { exitCode: errors.length > 0 ? 1 : 0, report };
}

function formatLoc(issue: Issue): string {
  const loc = issue.line !== undefined ? `line ${issue.line}: ` : "";
  return `${loc}[${issue.code}] ${issue.message}`;
}

function validateScopeSection(
  scope: Heading,
  headings: Heading[],
  bodyLines: MdLine[],
  err: (code: string, message: string, line?: number) => void
): void {
  const scopeBody = sectionLines(scope, headings, bodyLines);
  const scopeHeadings = findHeadings(scopeBody);
  for (const wanted of ["In scope", "Out of scope"]) {
    const h3 = headingByTitle(scopeHeadings, 3, wanted);
    if (h3 === undefined) {
      err("MISSING_SUBSECTION", `section "Scope" requires an H3 subsection "${wanted}"`, scope.line);
      continue;
    }
    const items = listItems(sectionLines(h3, scopeHeadings, scopeBody));
    if (items.length === 0) {
      err("EMPTY_SUBSECTION", `"${wanted}" must list at least one bullet`, h3.line);
    }
  }
}

interface FrontmatterValue {
  mode: string;
  status: string;
}

/** Locate the 1-based file line of a top-level frontmatter key. */
function fmKeyLine(fmText: string, key: string, fmStartLine: number): number {
  const lines = fmText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}:`)) return i + fmStartLine;
  }
  return fmStartLine;
}

function validateFrontmatter(
  fm: ReturnType<typeof extractFrontmatter>,
  err: (code: string, message: string, line?: number) => void
): FrontmatterValue | null {
  if (fm.unterminated) {
    err("BAD_FRONTMATTER", "frontmatter block opened with --- but never closed", 1);
    return null;
  }
  if (fm.text === null) {
    err("BAD_FRONTMATTER", "frontmatter is required (---\\nkind: spec\\nmode: feature|app|fix\\nstatus: draft|approved\\n---)", 1);
    return null;
  }
  let map: YamlMap;
  try {
    map = parseYaml(fm.text);
  } catch (e) {
    if (e instanceof YamlParseError) {
      err("BAD_FRONTMATTER", `frontmatter YAML is invalid: ${e.message}`, e.line + fm.fmStartLine - 1);
      return null;
    }
    throw e;
  }
  if (map.kind !== "spec") {
    err("BAD_FRONTMATTER", `frontmatter kind must be "spec" (found ${JSON.stringify(map.kind)})`, fmKeyLine(fm.text, "kind", fm.fmStartLine));
    return null;
  }
  if (typeof map.mode !== "string" || !SPEC_MODES.includes(map.mode)) {
    err(
      "BAD_FRONTMATTER",
      `frontmatter mode must be one of feature|app|fix (found ${JSON.stringify(map.mode)})`,
      fmKeyLine(fm.text, "mode", fm.fmStartLine)
    );
  }
  if (typeof map.status !== "string" || !SPEC_STATUSES.includes(map.status)) {
    err(
      "BAD_FRONTMATTER",
      `frontmatter status must be draft or approved (found ${JSON.stringify(map.status)})`,
      fmKeyLine(fm.text, "status", fm.fmStartLine)
    );
    return null;
  }
  if (typeof map.mode !== "string") return null;
  return { mode: map.mode, status: map.status };
}
