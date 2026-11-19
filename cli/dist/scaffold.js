"use strict";
/**
 * `kit scaffold` — generate standardized engineering artifacts from
 * templates. Refuses to overwrite without --force (exit 1).
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
exports.SCAFFOLD_KINDS = void 0;
exports.nextAdrNumber = nextAdrNumber;
exports.findAdrBySlug = findAdrBySlug;
exports.runScaffold = runScaffold;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const templates_1 = require("./templates");
const init_1 = require("./init");
exports.SCAFFOLD_KINDS = ["spec", "plan", "adr", "profile"];
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function nextAdrNumber(root) {
    const dir = path.join(root, "docs", "architecture", "adr");
    if (!fs.existsSync(dir))
        return 1;
    let max = 0;
    for (const entry of fs.readdirSync(dir)) {
        const m = /^(\d{3,})-.*\.md$/.exec(entry);
        if (m !== null) {
            const n = Number.parseInt(m[1], 10);
            if (!Number.isNaN(n) && n > max)
                max = n;
        }
    }
    return max + 1;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** An existing ADR with this slug (e.g. `001-same-slug.md`), with its number, or null. */
function findAdrBySlug(root, slug) {
    const dir = path.join(root, "docs", "architecture", "adr");
    if (!fs.existsSync(dir))
        return null;
    const re = new RegExp(`^(\\d{3,})-${escapeRegExp(slug)}\\.md$`);
    for (const entry of fs.readdirSync(dir)) {
        const m = re.exec(entry);
        if (m !== null)
            return { path: `docs/architecture/adr/${entry}`, number: Number.parseInt(m[1], 10) };
    }
    return null;
}
function runScaffold(root, opts) {
    const io = opts.io;
    const kind = opts.kind;
    if (!exports.SCAFFOLD_KINDS.includes(kind)) {
        io.err(`kit scaffold: unknown artifact "${kind}" (allowed: ${exports.SCAFFOLD_KINDS.join(", ")})`);
        if (opts.json)
            io.out(JSON.stringify({ status: "error", code: "UNKNOWN_KIND", kind }, null, 2));
        return { exitCode: 2, report: { status: "error", kind: kind, path: null, next: null } };
    }
    // --- profile delegates to init logic ---
    if (kind === "profile") {
        if (opts.slug !== undefined) {
            io.err("kit scaffold: profile does not take a slug");
            if (opts.json)
                io.out(JSON.stringify({ status: "error", code: "USAGE", message: "profile does not take a slug" }, null, 2));
            return { exitCode: 2, report: { status: "error", kind, path: null, next: null } };
        }
        const result = (0, init_1.initProfile)(root, {
            mode: opts.mode,
            stack: opts.stack,
            force: opts.force,
        });
        if (result.exitCode === 1) {
            io.err("kit scaffold: .ai/project.yml already exists — use --force to overwrite");
            if (opts.json)
                io.out(JSON.stringify({ status: "exists", kind, path: ".ai/project.yml", next: null }, null, 2));
            return { exitCode: 1, report: { status: "exists", kind, path: ".ai/project.yml", next: null } };
        }
        (0, init_1.createKitDirs)(root);
        const next = "kit verify";
        if (opts.json) {
            io.out(JSON.stringify({ status: "created", kind, path: ".ai/project.yml", next }, null, 2));
        }
        else {
            io.out(`Created .ai/project.yml`);
            io.out(`Next: ${next}`);
        }
        return { exitCode: 0, report: { status: "created", kind, path: ".ai/project.yml", next } };
    }
    // --- slug validation (prevents path traversal) ---
    const slug = opts.slug;
    if (slug === undefined || !SLUG_RE.test(slug) || slug.includes("..")) {
        io.err(`kit scaffold: invalid slug ${JSON.stringify(slug)} (use letters, digits, ".", "_" or "-")`);
        if (opts.json)
            io.out(JSON.stringify({ status: "error", code: "BAD_SLUG", slug: slug ?? null }, null, 2));
        return { exitCode: 2, report: { status: "error", kind: kind, path: null, next: null } };
    }
    let template;
    if (kind === "adr") {
        // an ADR with the same slug is the same artifact: refuse unless --force,
        // and with --force regenerate it under its existing number
        const existing = findAdrBySlug(root, slug);
        if (existing !== null && !opts.force) {
            io.err(`kit scaffold: ${existing.path} already exists — use --force to overwrite`);
            if (opts.json)
                io.out(JSON.stringify({ status: "exists", kind, path: existing.path, next: null }, null, 2));
            return { exitCode: 1, report: { status: "exists", kind: "adr", path: existing.path, next: null } };
        }
        const number = existing !== null ? existing.number : nextAdrNumber(root);
        template = (0, templates_1.adrTemplate)(slug, number);
    }
    else {
        template = kind === "spec" ? (0, templates_1.specTemplate)(slug) : (0, templates_1.planTemplate)(slug);
    }
    const target = path.join(root, template.path);
    if (fs.existsSync(target) && !opts.force) {
        io.err(`kit scaffold: ${template.path} already exists — use --force to overwrite`);
        if (opts.json)
            io.out(JSON.stringify({ status: "exists", kind, path: template.path, next: null }, null, 2));
        return { exitCode: 1, report: { status: "exists", kind: kind, path: template.path, next: null } };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, template.content, "utf8");
    const next = kind === "spec"
        ? `kit validate-spec ${template.path}`
        : kind === "plan"
            ? `kit validate-plan ${template.path}`
            : "link the ADR from related docs, then commit it";
    if (opts.json) {
        io.out(JSON.stringify({ status: "created", kind, path: template.path, next }, null, 2));
    }
    else {
        io.out(`Created ${template.path}`);
        io.out(`Next: ${next}`);
    }
    return { exitCode: 0, report: { status: "created", kind: kind, path: template.path, next } };
}
