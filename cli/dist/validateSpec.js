"use strict";
/**
 * `kit validate-spec` — deterministic spec structure validation.
 *
 * Draft specs downgrade the [soft] checks (Non-functional Requirements and
 * Open Questions presence) to warnings; approved specs treat them as errors.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runValidateSpec = runValidateSpec;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const markdown_1 = require("./markdown");
const yaml_1 = require("./yaml");
const AC_RE = /GIVEN|WHEN|THEN|should|must/i;
const SPEC_MODES = ["feature", "app", "fix"];
const SPEC_STATUSES = ["draft", "approved"];
function nonEmpty(lines) {
    return lines.some((ln) => ln.text.trim().length > 0);
}
function runValidateSpec(root, fileArg, opts) {
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
    const errors = [];
    const warnings = [];
    const err = (code, message, line) => {
        errors.push({ file: fileArg, line, code, message });
    };
    const warn = (code, message, line) => {
        warnings.push({ file: fileArg, line, code, message });
    };
    const fm = (0, markdown_1.extractFrontmatter)(text);
    let approved = false;
    // --- frontmatter ---
    const fmValue = validateFrontmatter(fm, err);
    if (fmValue !== null) {
        approved = fmValue.status === "approved";
    }
    const bodyLines = (0, markdown_1.toLines)(text).filter((ln) => ln.line >= fm.bodyStartLine);
    const headings = (0, markdown_1.findHeadings)(bodyLines);
    const h1 = headings.find((h) => h.level === 1);
    // --- H1 title ---
    if (h1 === undefined) {
        err("MISSING_H1", "spec must start with an H1 title (`# Title`)", fm.bodyStartLine);
    }
    else if (h1.line !== (headings[0] !== undefined ? headings[0].line : h1.line)) {
        err("MISSING_H1", "the first heading must be the H1 title", h1.line);
    }
    // --- required H2 sections ---
    const problem = (0, markdown_1.headingByTitle)(headings, 2, "Problem");
    if (problem === undefined) {
        err("MISSING_SECTION", 'required H2 section "Problem" is missing', h1 !== undefined ? h1.line : fm.bodyStartLine);
    }
    else if (!nonEmpty((0, markdown_1.sectionLines)(problem, headings, bodyLines))) {
        err("EMPTY_SECTION", 'section "Problem" must contain a non-empty description', problem.line);
    }
    const scope = (0, markdown_1.headingByTitle)(headings, 2, "Scope");
    if (scope === undefined) {
        err("MISSING_SECTION", 'required H2 section "Scope" is missing', h1 !== undefined ? h1.line : fm.bodyStartLine);
    }
    else {
        validateScopeSection(scope, headings, bodyLines, err);
    }
    const ac = (0, markdown_1.headingByTitle)(headings, 2, "Acceptance Criteria");
    let acceptanceCriteria = 0;
    if (ac === undefined) {
        err("MISSING_SECTION", 'required H2 section "Acceptance Criteria" is missing', h1 !== undefined ? h1.line : fm.bodyStartLine);
    }
    else {
        const items = (0, markdown_1.listItems)((0, markdown_1.sectionLines)(ac, headings, bodyLines));
        acceptanceCriteria = items.filter((ln) => AC_RE.test((0, markdown_1.itemText)(ln))).length;
        if (acceptanceCriteria === 0) {
            err("NO_ACCEPTANCE_CRITERIA", 'section "Acceptance Criteria" needs at least one bullet matching /GIVEN|WHEN|THEN|should|must/i', ac.line);
        }
    }
    // --- soft sections: NFR + Open Questions ---
    const nfr = (0, markdown_1.headingByTitle)(headings, 2, "Non-functional Requirements");
    if (nfr === undefined) {
        const issue = (code, message, line) => approved ? err(code, message, line) : warn(code, message, line);
        issue("MISSING_SECTION", 'H2 section "Non-functional Requirements" is missing' + (approved ? "" : " (warning: spec is a draft)"), h1 !== undefined ? h1.line : fm.bodyStartLine);
    }
    else {
        const lines = (0, markdown_1.sectionLines)(nfr, headings, bodyLines);
        const body = lines.map((l) => l.text.trim()).join(" ").trim();
        if (body === "" || /^none\.?$/i.test(body)) {
            warn("NFR_EMPTY", 'section "Non-functional Requirements" is empty or "None" (info)', nfr.line);
        }
    }
    const oq = (0, markdown_1.headingByTitle)(headings, 2, "Open Questions");
    if (oq === undefined) {
        const issue = (code, message, line) => approved ? err(code, message, line) : warn(code, message, line);
        issue("MISSING_SECTION", 'H2 section "Open Questions" is missing' + (approved ? "" : " (warning: spec is a draft)"), h1 !== undefined ? h1.line : fm.bodyStartLine);
    }
    else {
        const items = (0, markdown_1.listItems)((0, markdown_1.sectionLines)(oq, headings, bodyLines));
        if (items.length === 0) {
            warn("OPEN_QUESTIONS_EMPTY", 'section "Open Questions" is empty (info: resolve before implementation)', oq.line);
        }
    }
    const report = {
        status: errors.length > 0 ? "failed" : "passed",
        summary: { errors: errors.length, warnings: warnings.length, acceptanceCriteria },
        errors,
        warnings,
    };
    if (opts.json) {
        io.out(JSON.stringify(report, null, 2));
    }
    else {
        io.out(`kit validate-spec — ${fileArg}`);
        io.out("");
        for (const e of errors)
            io.out(`  ERROR   ${formatLoc(e)}`);
        for (const w of warnings)
            io.out(`  WARNING ${formatLoc(w)}`);
        if (errors.length === 0 && warnings.length === 0) {
            io.out(`  OK — ${acceptanceCriteria} acceptance criterion/criteria`);
        }
        io.out("");
        io.out(errors.length > 0
            ? `FAILED (${errors.length} error(s), ${warnings.length} warning(s))`
            : `PASSED (${warnings.length} warning(s))`);
    }
    return { exitCode: errors.length > 0 ? 1 : 0, report };
}
function formatLoc(issue) {
    const loc = issue.line !== undefined ? `line ${issue.line}: ` : "";
    return `${loc}[${issue.code}] ${issue.message}`;
}
function validateScopeSection(scope, headings, bodyLines, err) {
    const scopeBody = (0, markdown_1.sectionLines)(scope, headings, bodyLines);
    const scopeHeadings = (0, markdown_1.findHeadings)(scopeBody);
    for (const wanted of ["In scope", "Out of scope"]) {
        const h3 = (0, markdown_1.headingByTitle)(scopeHeadings, 3, wanted);
        if (h3 === undefined) {
            err("MISSING_SUBSECTION", `section "Scope" requires an H3 subsection "${wanted}"`, scope.line);
            continue;
        }
        const items = (0, markdown_1.listItems)((0, markdown_1.sectionLines)(h3, scopeHeadings, scopeBody));
        if (items.length === 0) {
            err("EMPTY_SUBSECTION", `"${wanted}" must list at least one bullet`, h3.line);
        }
    }
}
/** Locate the 1-based file line of a top-level frontmatter key. */
function fmKeyLine(fmText, key, fmStartLine) {
    const lines = fmText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${key}:`))
            return i + fmStartLine;
    }
    return fmStartLine;
}
function validateFrontmatter(fm, err) {
    if (fm.unterminated) {
        err("BAD_FRONTMATTER", "frontmatter block opened with --- but never closed", 1);
        return null;
    }
    if (fm.text === null) {
        err("BAD_FRONTMATTER", "frontmatter is required (---\\nkind: spec\\nmode: feature|app|fix\\nstatus: draft|approved\\n---)", 1);
        return null;
    }
    let map;
    try {
        map = (0, yaml_1.parseYaml)(fm.text);
    }
    catch (e) {
        if (e instanceof yaml_1.YamlParseError) {
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
        err("BAD_FRONTMATTER", `frontmatter mode must be one of feature|app|fix (found ${JSON.stringify(map.mode)})`, fmKeyLine(fm.text, "mode", fm.fmStartLine));
    }
    if (typeof map.status !== "string" || !SPEC_STATUSES.includes(map.status)) {
        err("BAD_FRONTMATTER", `frontmatter status must be draft or approved (found ${JSON.stringify(map.status)})`, fmKeyLine(fm.text, "status", fm.fmStartLine));
        return null;
    }
    if (typeof map.mode !== "string")
        return null;
    return { mode: map.mode, status: map.status };
}
