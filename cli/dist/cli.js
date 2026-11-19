"use strict";
/**
 * `kit` — the deterministic engineering CLI of the Agentic SDLC Kit.
 *
 * Exit codes (documented in every --help):
 *   0  OK / checks passed
 *   1  check or validation FAILED
 *   2  usage or configuration error
 *   3  blocked — prerequisite missing
 *
 * Security model: the kit NEVER executes shell strings. External processes
 * are spawned exclusively as validated argument arrays with shell:false.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = void 0;
exports.main = main;
exports.run = run;
const report_1 = require("./report");
const doctor_1 = require("./doctor");
const inspect_1 = require("./inspect");
const init_1 = require("./init");
const validateSpec_1 = require("./validateSpec");
const validatePlan_1 = require("./validatePlan");
const verify_1 = require("./verify");
const audit_1 = require("./audit");
const changed_1 = require("./changed");
const releaseCheck_1 = require("./releaseCheck");
const scaffold_1 = require("./scaffold");
exports.VERSION = "5.0.0";
const EXIT_CODES = `Exit codes:
  0  OK / checks passed
  1  check or validation FAILED
  2  usage or configuration error
  3  blocked (prerequisite missing)`;
const HELP = {
    doctor: {
        usage: "kit doctor [--json]",
        description: [
            "Check the environment: node version, git, package managers, project",
            "manifests, kit manifest integrity, claude CLI version and MCP build",
            "state. Prints a checklist; exits 1 only when a required check FAILs.",
            "",
            "Checks: node-version, git-present, package-managers, project-detection,",
            "kit-integrity, claude-version, mcp-build-state",
        ],
    },
    inspect: {
        usage: "kit inspect [--json]",
        description: [
            "Inventory the project: file counts by extension, manifests, detected",
            "frameworks, test frameworks, lint/typecheck configs, git state and kit",
            "state (specs, plans, ADRs). Always exits 0.",
        ],
    },
    init: {
        usage: "kit init [--mode existing|greenfield] [--stack rails|rails-ts|nextjs|node-ts-lib] [--force] [--json]",
        description: [
            "Discover the project and write .ai/project.yml plus the standard",
            "engineering directory skeleton (docs/specifications, docs/plans,",
            "docs/architecture/adr, ...). Quality commands are prefilled ONLY for",
            "scripts that exist in package.json. Refuses to overwrite an existing",
            "profile unless --force is given (exit 1).",
        ],
    },
    "validate-spec": {
        usage: "kit validate-spec <file> [--json]",
        description: [
            "Validate spec structure: frontmatter (kind: spec, mode, status), H1",
            'title, H2 sections Problem, Scope (with "In scope"/"Out of scope" H3s),',
            "Acceptance Criteria (>=1 GIVEN/WHEN/THEN/should/must bullet),",
            "Non-functional Requirements and Open Questions. Draft specs downgrade",
            "the soft checks to warnings; approved specs treat them as errors.",
        ],
    },
    "validate-plan": {
        usage: "kit validate-plan <file> [--json]",
        description: [
            "Validate plan structure: frontmatter (kind: plan, spec reference,",
            'mode), an existing spec with kind: spec, non-empty "Approach", "Tasks"',
            "with TASK-### headings, Depends lines, Acceptance and Verification",
            'lists, dependency existence and cycles, "Checkpoints" with design and',
            "test review items. A missing plan file exits 2.",
        ],
    },
    verify: {
        usage: "kit verify [--check id1,id2] [--keep-going] [--json]",
        description: [
            "Run the project's quality gates from .ai/project.yml in order, with",
            "shell:false, cwd at the project root and a per-check timeout. Statuses:",
            "passed / failed / skipped (absent or executable not found) / blocked",
            "(stopOnFailure after a failure, unless --keep-going). Writes a JSON",
            "verification report to .ai/reports/verification/. Requires kit init.",
        ],
    },
    audit: {
        usage: "kit audit [--json] [--no-dependency-audit]",
        description: [
            "Scan tracked files (git ls-files) or the directory tree for secrets",
            "using the kit's canonical pattern set, with allowlist suppression via",
            ".ai/audit-allowlist.txt. Optionally run a dependency audit (npm audit",
            "or bundle audit). Previews are truncated to 8 characters.",
        ],
    },
    changed: {
        usage: "kit changed [--base REF] [--json]",
        description: [
            "Summarize changed files: working tree (git status) plus base diff",
            "(BASE...HEAD, default base main, fallback master), classified into",
            "test / migrations / docs / config / source / other, with affected",
            "areas. Exits 3 outside a git repository.",
        ],
    },
    "release-check": {
        usage: "kit release-check [--version V] [--allow-dirty] [--allow-main] [--no-dependency-audit] [--json]",
        description: [
            "Validate release readiness: changelog mentions the version, a passing",
            "verification report exists and is at most 7 days old, the tree is",
            "clean, the branch is not main/master, the tag v<V> does not exist, and",
            "the audit passes. Version comes from --version, package.json or the",
            "first CHANGELOG.md heading. Exits 3 with no version or outside a repo.",
        ],
    },
    scaffold: {
        usage: "kit scaffold <spec|plan|adr|profile> <slug> [--force] [--json]",
        description: [
            "Generate a standardized artifact from a template: a spec (ships",
            "valid), a plan (references ./missing-spec.md on purpose), an ADR",
            "(auto-increments NNN) or the project profile (delegates to init).",
            "Refuses to overwrite without --force (exit 1).",
        ],
    },
};
const COMMANDS = ["doctor", "inspect", "init", "validate-spec", "validate-plan", "verify", "audit", "changed", "release-check", "scaffold"];
const USAGE = `kit ${exports.VERSION} — Agentic SDLC Kit engineering CLI

Usage: kit <command> [options]

Commands:
  doctor          Detect environment, runtime and available tools
  inspect         Inventory project structure and conventions
  init            Create the project profile and directory skeleton
  validate-spec   Validate specification structure and acceptance criteria
  validate-plan   Validate tasks, dependencies and verification steps
  verify          Run project-specific quality gates
  audit           Secret scanning and dependency audit
  changed         Summarize changed files and affected boundaries
  release-check   Validate release readiness
  scaffold        Generate standardized engineering artifacts

Global options:
  --json          Machine-readable output on stdout
  --help, -h      Show help for a command
  --version       Show the kit CLI version

${EXIT_CODES}

Security: commands from the project profile are executed strictly as
validated argument arrays with shell:false — never as shell strings.`;
function commandHelp(cmd) {
    const h = HELP[cmd];
    if (h === undefined)
        return USAGE;
    return [`Usage: ${h.usage}`, "", h.description.join("\n"), "", "Options:", "  --json    Machine-readable output", "  --help    Show this help", "", EXIT_CODES].join("\n");
}
const VALUE_FLAGS = new Set(["--check", "--base", "--version", "--mode", "--stack"]);
function parseArgs(argv) {
    const args = { positionals: [], flags: new Set(), values: new Map() };
    let i = 0;
    while (i < argv.length) {
        const token = argv[i];
        if (token === "--") {
            i++;
            while (i < argv.length) {
                args.positionals.push(argv[i]);
                i++;
            }
            break;
        }
        if (token.startsWith("--")) {
            const eq = token.indexOf("=");
            if (eq >= 0) {
                const name = token.slice(0, eq);
                const value = token.slice(eq + 1);
                if (VALUE_FLAGS.has(name)) {
                    args.values.set(name, value);
                }
                else {
                    return { args, error: `unknown option "${name}"` };
                }
            }
            else if (VALUE_FLAGS.has(token)) {
                const next = argv[i + 1];
                if (next === undefined || next.startsWith("-")) {
                    // `kit --version` with no value: record as present-but-empty
                    args.values.set(token, "");
                }
                else {
                    args.values.set(token, next);
                    i++;
                }
            }
            else if (token === "--json" || token === "--help" || token === "-h" || token === "--force" || token === "--keep-going" || token === "--no-dependency-audit" || token === "--allow-dirty" || token === "--allow-main") {
                args.flags.add(token);
            }
            else {
                return { args, error: `unknown option "${token}"` };
            }
        }
        else if (token.startsWith("-") && token.length > 1 && token !== "-") {
            return { args, error: `unknown option "${token}"` };
        }
        else {
            args.positionals.push(token);
        }
        i++;
    }
    if (args.positionals.length > 0) {
        const first = args.positionals[0];
        if (first !== undefined && COMMANDS.includes(first)) {
            args.command = first;
            args.positionals = args.positionals.slice(1);
        }
    }
    return { args };
}
async function main(argv, io = (0, report_1.defaultIO)(), root = process.cwd()) {
    const { args, error } = parseArgs(argv);
    const wantsHelp = args.flags.has("--help") || args.flags.has("-h");
    const json = args.flags.has("--json");
    if (error !== undefined) {
        io.err(`kit: ${error}`);
        io.err("Run `kit --help` for usage.");
        return 2;
    }
    // kit --version (bare; release-check's --version takes a value)
    if (args.command === undefined && args.values.has("--version")) {
        io.out(`kit ${exports.VERSION}`);
        return 0;
    }
    if (args.command === undefined) {
        if (wantsHelp) {
            io.out(USAGE);
            return 0;
        }
        if (argv.length === 0) {
            io.err("kit: missing command");
            io.err("Run `kit --help` for usage.");
            return 2;
        }
        // positional args given but no known command name first
        const first = argv.find((a) => !a.startsWith("-"));
        if (first !== undefined) {
            io.err(`kit: unknown command "${first}"`);
        }
        else {
            io.err("kit: missing command");
        }
        io.err("Run `kit --help` for usage.");
        return 2;
    }
    if (wantsHelp) {
        io.out(commandHelp(args.command));
        return 0;
    }
    const flag = (name) => args.flags.has(name);
    const value = (name) => args.values.get(name);
    switch (args.command) {
        case "doctor":
            return (0, doctor_1.runDoctor)(root, { json, io }).exitCode;
        case "inspect":
            return (0, inspect_1.runInspect)(root, { json, io }).exitCode;
        case "init": {
            if (args.positionals.length > 0) {
                io.err(`kit init: unexpected argument "${args.positionals[0]}"`);
                return 2;
            }
            return (0, init_1.runInit)(root, {
                mode: value("--mode"),
                stack: value("--stack"),
                force: flag("--force"),
                json,
                io,
            }).exitCode;
        }
        case "validate-spec": {
            const file = args.positionals[0];
            if (file === undefined) {
                io.err("kit validate-spec: missing <file> argument");
                io.err("Usage: kit validate-spec <file> [--json]");
                return 2;
            }
            if (args.positionals.length > 1) {
                io.err(`kit validate-spec: unexpected argument "${args.positionals[1]}"`);
                return 2;
            }
            return (0, validateSpec_1.runValidateSpec)(root, file, { json, io }).exitCode;
        }
        case "validate-plan": {
            const file = args.positionals[0];
            if (file === undefined) {
                io.err("kit validate-plan: missing <file> argument");
                io.err("Usage: kit validate-plan <file> [--json]");
                return 2;
            }
            if (args.positionals.length > 1) {
                io.err(`kit validate-plan: unexpected argument "${args.positionals[1]}"`);
                return 2;
            }
            return (0, validatePlan_1.runValidatePlan)(root, file, { json, io }).exitCode;
        }
        case "verify": {
            if (args.positionals.length > 0) {
                io.err(`kit verify: unexpected argument "${args.positionals[0]}"`);
                return 2;
            }
            const checkValue = value("--check");
            const check = checkValue !== undefined ? checkValue.split(",").map((c) => c.trim()).filter((c) => c.length > 0) : undefined;
            if (check !== undefined && check.length === 0) {
                io.err("kit verify: --check requires at least one check id");
                return 2;
            }
            // record only the arguments AFTER the command token in the report
            const cmdIndex = argv.indexOf("verify");
            const verifyArgv = cmdIndex >= 0 ? argv.slice(cmdIndex + 1) : argv;
            return (0, verify_1.runVerify)({
                root,
                check,
                keepGoing: flag("--keep-going"),
                json,
                argv: verifyArgv,
                io,
            }).exitCode;
        }
        case "audit": {
            if (args.positionals.length > 0) {
                io.err(`kit audit: unexpected argument "${args.positionals[0]}"`);
                return 2;
            }
            return (0, audit_1.runAudit)(root, { json, dependencyAudit: !flag("--no-dependency-audit"), io }).exitCode;
        }
        case "changed": {
            if (args.positionals.length > 0) {
                io.err(`kit changed: unexpected argument "${args.positionals[0]}"`);
                return 2;
            }
            return (0, changed_1.runChanged)(root, { base: value("--base"), json, io }).exitCode;
        }
        case "release-check": {
            if (args.positionals.length > 0) {
                io.err(`kit release-check: unexpected argument "${args.positionals[0]}"`);
                return 2;
            }
            return (0, releaseCheck_1.runReleaseCheck)(root, {
                version: value("--version"),
                allowDirty: flag("--allow-dirty"),
                allowMain: flag("--allow-main"),
                dependencyAudit: !flag("--no-dependency-audit"),
                json,
                io,
            }).exitCode;
        }
        case "scaffold": {
            const kind = args.positionals[0];
            const slug = args.positionals[1];
            if (kind === undefined) {
                io.err("kit scaffold: missing <spec|plan|adr|profile> argument");
                io.err("Usage: kit scaffold <spec|plan|adr|profile> <slug> [--force] [--json]");
                return 2;
            }
            if (args.positionals.length > 2) {
                io.err(`kit scaffold: unexpected argument "${args.positionals[2]}"`);
                return 2;
            }
            return (0, scaffold_1.runScaffold)(root, {
                kind,
                slug,
                force: flag("--force"),
                json,
                mode: value("--mode"),
                stack: value("--stack"),
                io,
            }).exitCode;
        }
        default:
            io.err(`kit: unknown command "${args.command}"`);
            return 2;
    }
}
/** Entry point used by bin/kit.js (and by `node dist/cli.js`). */
function run() {
    const root = process.cwd();
    main(process.argv.slice(2), (0, report_1.defaultIO)(), root).then((code) => {
        process.exitCode = code;
    }, (err) => {
        process.stderr.write(`kit: internal error: ${String(err)}\n`);
        process.exitCode = 2;
    });
}
if (require.main === module) {
    run();
}
