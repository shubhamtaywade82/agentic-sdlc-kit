"use strict";
/**
 * `kit validate-plan` — task, dependency and verification validation.
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
exports.runValidatePlan = runValidatePlan;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const markdown_1 = require("./markdown");
const yaml_1 = require("./yaml");
const TASK_HEADING_RE = /^(TASK-\d{3,}):\s*(.*)$/;
const TASK_ID_RE = /^TASK-\d{3,}$/;
const DEPENDS_RE = /^[-*]\s*Depends:\s*(.*)$/i;
const LABEL_RE = /^[-*]?\s*\*{0,2}(Acceptance|Verification)\*{0,2}:?\s*$/i;
const PLAN_MODES = ["feature", "app", "fix"];
/** tasks with more than this many acceptance+verification items are too large */
const MAX_TASK_ITEMS = 15;
function fmKeyLine(fmText, key, fmStartLine) {
    const lines = fmText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${key}:`))
            return i + fmStartLine;
    }
    return fmStartLine;
}
function runValidatePlan(root, fileArg, opts) {
    const io = opts.io;
    const file = path.resolve(root, fileArg);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        io.err(`kit validate-plan: file not found: ${fileArg}`);
        if (opts.json) {
            io.out(JSON.stringify({ status: "error", code: "FILE_NOT_FOUND", file: fileArg }, null, 2));
        }
        return {
            exitCode: 2,
            report: {
                status: "failed",
                summary: { errors: 0, warnings: 0, tasks: { total: 0, valid: 0, invalid: 0 } },
                errors: [],
                warnings: [],
            },
        };
    }
    const text = fs.readFileSync(file, "utf8");
    const errors = [];
    const warnings = [];
    const err = (code, message, line, task) => {
        errors.push({ file: fileArg, line, code, message, task });
    };
    const warn = (code, message, line, task) => {
        warnings.push({ file: fileArg, line, code, message, task });
    };
    const fm = (0, markdown_1.extractFrontmatter)(text);
    // --- frontmatter ---
    let specPath = null;
    if (fm.unterminated) {
        err("BAD_FRONTMATTER", "frontmatter block opened with --- but never closed", 1);
    }
    else if (fm.text === null) {
        err("BAD_FRONTMATTER", "frontmatter is required (---\\nkind: plan\\nmode: feature\\nspec: ./spec.md\\n---)", 1);
    }
    else {
        let map;
        try {
            map = (0, yaml_1.parseYaml)(fm.text);
        }
        catch (e) {
            if (e instanceof yaml_1.YamlParseError) {
                err("BAD_FRONTMATTER", `frontmatter YAML is invalid: ${e.message}`, e.line + fm.fmStartLine - 1);
                map = {};
            }
            else {
                throw e;
            }
        }
        if (map.kind !== "plan") {
            err("BAD_FRONTMATTER", `frontmatter kind must be "plan" (found ${JSON.stringify(map.kind)})`, fm.text !== null ? fmKeyLine(fm.text, "kind", fm.fmStartLine) : undefined);
        }
        if (typeof map.mode !== "string" || !PLAN_MODES.includes(map.mode)) {
            err("BAD_FRONTMATTER", `frontmatter mode must be one of feature|app|fix (found ${JSON.stringify(map.mode)})`, fm.text !== null ? fmKeyLine(fm.text, "mode", fm.fmStartLine) : undefined);
        }
        if (typeof map.spec !== "string" || map.spec.trim() === "") {
            err("BAD_FRONTMATTER", "frontmatter spec must be a relative path to the specification file", fm.text !== null ? fmKeyLine(fm.text, "spec", fm.fmStartLine) : undefined);
        }
        else {
            specPath = map.spec.trim();
        }
    }
    // --- spec reference ---
    if (specPath !== null) {
        const candidates = [path.resolve(path.dirname(file), specPath), path.resolve(root, specPath)];
        const specFile = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
        if (specFile === undefined) {
            err("SPEC_NOT_FOUND", `referenced spec "${specPath}" does not exist (looked in the plan directory and the project root)`, fm.text !== null ? fmKeyLine(fm.text, "spec", fm.fmStartLine) : undefined);
        }
        else {
            const specText = fs.readFileSync(specFile, "utf8");
            const specFm = (0, markdown_1.extractFrontmatter)(specText);
            let specKind = null;
            if (specFm.text !== null && !specFm.unterminated) {
                try {
                    specKind = (0, yaml_1.parseYaml)(specFm.text).kind;
                }
                catch {
                    specKind = null;
                }
            }
            if (specKind !== "spec") {
                err("SPEC_KIND_MISMATCH", `referenced file "${specPath}" has frontmatter kind ${JSON.stringify(specKind)}; expected "spec"`, fm.text !== null ? fmKeyLine(fm.text, "spec", fm.fmStartLine) : undefined);
            }
        }
    }
    const bodyLines = (0, markdown_1.toLines)(text).filter((ln) => ln.line >= fm.bodyStartLine);
    const headings = (0, markdown_1.findHeadings)(bodyLines);
    // --- Approach ---
    const approach = (0, markdown_1.headingByTitle)(headings, 2, "Approach");
    if (approach === undefined) {
        err("MISSING_SECTION", 'required H2 section "Approach" is missing');
    }
    else if (!(0, markdown_1.sectionLines)(approach, headings, bodyLines).some((ln) => ln.text.trim().length > 0)) {
        err("EMPTY_SECTION", 'section "Approach" must describe the implementation approach', approach.line);
    }
    // --- Tasks ---
    const tasksHeading = (0, markdown_1.headingByTitle)(headings, 2, "Tasks");
    const tasks = [];
    if (tasksHeading === undefined) {
        err("MISSING_SECTION", 'required H2 section "Tasks" is missing');
    }
    else {
        const tasksBody = (0, markdown_1.sectionLines)(tasksHeading, headings, bodyLines);
        const h3s = (0, markdown_1.findHeadings)(tasksBody).filter((h) => h.level === 3);
        for (const h3 of h3s) {
            const m = TASK_HEADING_RE.exec(h3.text);
            if (m === null) {
                err("INVALID_TASK_HEADING", `H3 "${h3.text}" under "Tasks" must match TASK-### with a title (e.g. "### TASK-001: Set up schema")`, h3.line);
                continue;
            }
            const id = m[1];
            const title = m[2].trim();
            if (title === "") {
                err("TASK_TITLE_MISSING", `task ${id} needs a title after the id`, h3.line, id);
            }
            if (tasks.some((t) => t.id === id)) {
                err("DUPLICATE_TASK_ID", `duplicate task id ${id}`, h3.line, id);
                continue;
            }
            const body = (0, markdown_1.sectionLines)(h3, (0, markdown_1.findHeadings)(tasksBody), tasksBody);
            tasks.push(parseTask(id, h3, body, err, warn));
        }
    }
    // --- dependency references ---
    const ids = new Set(tasks.map((t) => t.id));
    for (const task of tasks) {
        for (const dep of task.depends) {
            if (!ids.has(dep)) {
                err("DEPENDENCY_NOT_FOUND", `task ${task.id} depends on "${dep}", which does not exist`, task.heading.line, task.id);
            }
        }
    }
    // --- cycles ---
    detectCycles(tasks, err);
    // --- Checkpoints ---
    const checkpoints = (0, markdown_1.headingByTitle)(headings, 2, "Checkpoints");
    if (checkpoints === undefined) {
        err("MISSING_SECTION", 'required H2 section "Checkpoints" is missing');
    }
    else {
        const lines = (0, markdown_1.sectionLines)(checkpoints, headings, bodyLines);
        if (!lines.some((ln) => /design review/i.test(ln.text))) {
            err("MISSING_CHECKPOINT", 'section "Checkpoints" must include a "Design review" item', checkpoints.line);
        }
        if (!lines.some((ln) => /test review|verification review/i.test(ln.text))) {
            err("MISSING_CHECKPOINT", 'section "Checkpoints" must include a "Test review" (or "Verification review") item', checkpoints.line);
        }
    }
    const invalidTasks = new Set();
    for (const e of errors) {
        if (e.task !== undefined)
            invalidTasks.add(e.task);
    }
    const report = {
        status: errors.length > 0 ? "failed" : "passed",
        summary: {
            errors: errors.length,
            warnings: warnings.length,
            tasks: { total: tasks.length, valid: tasks.length - invalidTasks.size, invalid: invalidTasks.size },
        },
        errors,
        warnings,
    };
    if (opts.json) {
        io.out(JSON.stringify(report, null, 2));
    }
    else {
        io.out(`kit validate-plan — ${fileArg}`);
        io.out("");
        for (const e of errors)
            io.out(`  ERROR   ${e.task !== undefined ? `[${e.task}] ` : ""}${e.line !== undefined ? `line ${e.line}: ` : ""}[${e.code}] ${e.message}`);
        for (const w of warnings)
            io.out(`  WARNING ${w.task !== undefined ? `[${w.task}] ` : ""}${w.line !== undefined ? `line ${w.line}: ` : ""}[${w.code}] ${w.message}`);
        if (errors.length === 0 && warnings.length === 0) {
            io.out(`  OK — ${tasks.length} task(s)`);
        }
        io.out("");
        io.out(errors.length > 0
            ? `FAILED (${errors.length} error(s), ${warnings.length} warning(s), ${tasks.length} task(s))`
            : `PASSED (${warnings.length} warning(s), ${tasks.length} task(s))`);
    }
    return { exitCode: errors.length > 0 ? 1 : 0, report };
}
function parseTask(id, heading, body, err, warn) {
    // Depends line
    let depends = [];
    const dependsLine = body.find((ln) => DEPENDS_RE.test(ln.text));
    if (dependsLine === undefined) {
        err("MISSING_DEPENDS", `task ${id} must declare "- Depends: none" or a comma-separated task id list`, heading.line, id);
    }
    else {
        const m = DEPENDS_RE.exec(dependsLine.text);
        const raw = m !== null ? m[1].trim() : "";
        if (/^none$/i.test(raw)) {
            depends = [];
        }
        else {
            const parts = raw
                .split(",")
                .map((p) => p.trim())
                .filter((p) => p.length > 0);
            if (parts.length === 0) {
                err("MISSING_DEPENDS", `task ${id} has an empty Depends declaration (use "none" or task ids)`, dependsLine.line, id);
            }
            for (const p of parts) {
                if (!TASK_ID_RE.test(p)) {
                    err("DEPENDENCY_NOT_FOUND", `task ${id} depends on "${p}", which is not a valid TASK-### id`, dependsLine.line, id);
                }
                else {
                    depends.push(p);
                }
            }
        }
    }
    // Acceptance / Verification sub-lists
    const acceptance = collectLabelItems(body, "Acceptance");
    const verification = collectLabelItems(body, "Verification");
    if (labelMissing(body, "Acceptance") || acceptance.length === 0) {
        err("MISSING_ACCEPTANCE", `task ${id} needs an "Acceptance:" list with at least one item`, heading.line, id);
    }
    if (labelMissing(body, "Verification") || verification.length === 0) {
        err("MISSING_VERIFICATION", `task ${id} needs a "Verification:" list with at least one item`, heading.line, id);
    }
    if (acceptance.length + verification.length > MAX_TASK_ITEMS) {
        warn("TASK_TOO_LARGE", `task ${id} has ${acceptance.length + verification.length} acceptance+verification items (>${MAX_TASK_ITEMS}); split it into smaller tasks`, heading.line, id);
    }
    return { id, heading, depends, acceptance, verification };
}
/** True when a label line (e.g. `Acceptance:`) is absent from the task body. */
function labelMissing(body, label) {
    return !body.some((ln) => {
        const m = LABEL_RE.exec(ln.text);
        return m !== null && m[1].toLowerCase() === label.toLowerCase();
    });
}
/** Items of the list that follows a label line like `Acceptance:`. */
function collectLabelItems(body, label) {
    const items = [];
    let collecting = false;
    for (const ln of body) {
        const m = LABEL_RE.exec(ln.text);
        if (m !== null) {
            collecting = m[1].toLowerCase() === label.toLowerCase();
            continue;
        }
        if (collecting) {
            if (/^[-*] /.test(ln.text)) {
                items.push(ln);
            }
            else if (ln.text.trim() !== "") {
                collecting = false; // list ended
            }
        }
    }
    return items;
}
function detectCycles(tasks, err) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const visiting = new Set();
    const done = new Set();
    const stack = [];
    const visit = (id) => {
        if (done.has(id))
            return;
        if (visiting.has(id)) {
            const start = stack.indexOf(id);
            const cycle = stack.slice(start >= 0 ? start : 0).concat(id);
            const task = byId.get(id);
            err("CYCLE_DETECTED", `dependency cycle detected: ${cycle.join(" -> ")}`, task !== undefined ? task.heading.line : undefined, id);
            return;
        }
        visiting.add(id);
        stack.push(id);
        const task = byId.get(id);
        if (task !== undefined) {
            for (const dep of task.depends) {
                if (byId.has(dep))
                    visit(dep);
            }
        }
        stack.pop();
        visiting.delete(id);
        done.add(id);
    };
    for (const t of tasks) {
        if (!done.has(t.id) && !visiting.has(t.id)) {
            stack.length = 0;
            visit(t.id);
        }
    }
}
