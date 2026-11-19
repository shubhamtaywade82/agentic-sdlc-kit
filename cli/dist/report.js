"use strict";
/**
 * Shared output and reporting primitives.
 *
 * Conventions used by every command:
 *   - human-readable output goes to stdout (`io.out`)
 *   - diagnostics go to stderr (`io.err`)
 *   - `--json` prints a machine-readable object to stdout
 *   - report files carry ISO timestamps and a runId
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
exports.defaultIO = defaultIO;
exports.formatIssue = formatIssue;
exports.compactTimestamp = compactTimestamp;
exports.randomHex6 = randomHex6;
exports.newRunId = newRunId;
exports.writeJsonReport = writeJsonReport;
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function defaultIO() {
    return {
        out(line) {
            process.stdout.write(line + "\n");
        },
        err(line) {
            process.stderr.write(line + "\n");
        },
    };
}
function formatIssue(issue) {
    const loc = issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
    const task = issue.task !== undefined ? ` [${issue.task}]` : "";
    return `${loc}${task} [${issue.code}] ${issue.message}`;
}
/** Compact UTC timestamp, e.g. `20250131T093012Z`. */
function compactTimestamp(now = new Date()) {
    return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
/** Random 6-char lowercase hex string. */
function randomHex6() {
    return (0, crypto_1.randomBytes)(3).toString("hex");
}
/** A run identifier `<compact-timestamp>-<6 hex chars>`. */
function newRunId() {
    return `${compactTimestamp()}-${randomHex6()}`;
}
/** Write a JSON report file under `<root>/<relativeDir>/` and return its `/`-joined relative path. */
function writeJsonReport(root, relativeDir, fileName, data) {
    const dir = path.join(root, relativeDir);
    fs.mkdirSync(dir, { recursive: true });
    const relativePath = `${relativeDir}/${fileName}`.replace(/\\/g, "/");
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(data, null, 2) + "\n", "utf8");
    return relativePath;
}
