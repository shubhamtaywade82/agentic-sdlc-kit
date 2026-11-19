"use strict";
/**
 * `kit changed` — summarize changed files (working tree + base diff) and
 * classify them into test / migrations / docs / config / source / other.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANGE_CATEGORIES = void 0;
exports.classifyPath = classifyPath;
exports.runChanged = runChanged;
const git_1 = require("./git");
exports.CHANGE_CATEGORIES = ["test", "migrations", "docs", "config", "source", "other"];
const CODE_EXTENSIONS = new Set([
    "js", "mjs", "cjs", "ts", "tsx", "jsx", "rb", "py", "go", "rs", "java", "kt", "swift",
    "c", "h", "cpp", "hpp", "cc", "cs", "php", "sh", "bash", "zsh", "json", "yml", "yaml",
    "toml", "sql", "html", "css", "scss", "sass", "less", "vue", "svelte", "ex", "exs",
    "erl", "scala", "dart", "lua", "pl", "r", "m", "mts", "cts",
]);
function classifyPath(filePath) {
    const p = filePath.replace(/\\/g, "/");
    if (/(^|\/)(specs?|tests?)\/|__tests__|_spec\.|\.test\./.test(p))
        return "test";
    if (/db\/migrate|migration/.test(p))
        return "migrations";
    if (/^docs\/|\.md$/i.test(p))
        return "docs";
    if (/(^|\/)\.[^/]+/.test(p) || /\.config\./.test(p) || /(^|\/)\.github(\/|$)/.test(p) || /(^|\/)\.gitlab(\/|$)/.test(p)) {
        return "config";
    }
    const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
    if (p.includes(".") && CODE_EXTENSIONS.has(ext))
        return "source";
    return "other";
}
/** Extract the path from one `git status --porcelain` line. */
function porcelainPath(line) {
    let rest = line.slice(3); // skip XY + space
    const arrow = rest.indexOf(" -> ");
    if (arrow >= 0)
        rest = rest.slice(arrow + 4);
    rest = rest.trim();
    if (rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2) {
        rest = rest.slice(1, -1);
    }
    return rest;
}
function affectedAreas(files) {
    const areas = new Set();
    for (const f of files) {
        const norm = f.replace(/\\/g, "/");
        const slash = norm.indexOf("/");
        areas.add(slash > 0 ? norm.slice(0, slash) : norm);
    }
    return Array.from(areas).sort();
}
function runChanged(root, opts) {
    const io = opts.io;
    if (!(0, git_1.isGitRepo)(root)) {
        io.err("kit changed: not a git repository (git rev-parse failed)");
        if (opts.json) {
            io.out(JSON.stringify({ status: "error", code: "NOT_A_REPOSITORY" }, null, 2));
        }
        return { exitCode: 3, report: null };
    }
    let base = null;
    if (opts.base !== undefined) {
        if (!(0, git_1.refExists)(root, opts.base)) {
            io.err(`kit changed: base ref "${opts.base}" does not exist`);
            if (opts.json) {
                io.out(JSON.stringify({ status: "error", code: "BASE_NOT_FOUND", base: opts.base }, null, 2));
            }
            return { exitCode: 2, report: null };
        }
        base = opts.base;
    }
    else {
        base = (0, git_1.refExists)(root, "main") ? "main" : (0, git_1.refExists)(root, "master") ? "master" : null;
        if (base === null) {
            io.err("kit changed: no base ref found (tried main, master) — pass --base <ref>");
            if (opts.json) {
                io.out(JSON.stringify({ status: "error", code: "BASE_NOT_FOUND", base: null }, null, 2));
            }
            return { exitCode: 2, report: null };
        }
    }
    const statusLines = (0, git_1.gitStatusPorcelain)(root);
    const working = statusLines.map(porcelainPath).filter((p) => p.length > 0);
    const diff = (0, git_1.gitDiffNames)(root, base);
    // A fresh repository (no commits yet) has no HEAD to diff against — the
    // working-tree status is still meaningful, so treat the diff as empty.
    const committed = diff.ok ? diff.files : [];
    const all = Array.from(new Set([...working, ...committed]));
    const classification = {};
    for (const cat of exports.CHANGE_CATEGORIES)
        classification[cat] = { count: 0, files: [] };
    for (const f of all) {
        const cat = classifyPath(f);
        classification[cat].count++;
        classification[cat].files.push(f);
    }
    const report = {
        status: "ok",
        base,
        branch: (0, git_1.gitBranch)(root),
        dirty: working.length,
        classification,
        affectedAreas: affectedAreas(all),
    };
    if (opts.json) {
        io.out(JSON.stringify(report, null, 2));
    }
    else {
        io.out("kit changed — changed files");
        io.out("");
        io.out(`  Branch: ${report.branch ?? "(detached)"} (working tree changes: ${report.dirty})`);
        io.out(`  Base:   ${base}...HEAD (${committed.length} committed file(s))`);
        io.out("");
        for (const cat of exports.CHANGE_CATEGORIES) {
            const c = classification[cat];
            if (c.count === 0)
                continue;
            io.out(`  ${cat.padEnd(11)} ${c.count}`);
            for (const f of c.files)
                io.out(`    - ${f}`);
        }
        io.out("");
        io.out(`  Affected areas: ${report.affectedAreas.length > 0 ? report.affectedAreas.join(", ") : "(none)"}`);
        if (!diff.ok && diff.stderr.length > 0) {
            io.err(`  note: git diff against ${base} failed (${firstLine(diff.stderr)})`);
        }
    }
    return { exitCode: 0, report };
}
function firstLine(text) {
    const idx = text.indexOf("\n");
    return idx >= 0 ? text.slice(0, idx) : text;
}
