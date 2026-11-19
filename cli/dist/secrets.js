"use strict";
/**
 * Canonical secret-detection patterns shared with the runtime guard mod.
 * The regexes below are the single source of truth — keep them byte-identical
 * when porting to other kit components.
 *
 * Previews NEVER contain the full secret: first 8 characters + "…".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECRET_PATTERNS = void 0;
exports.isPlaceholder = isPlaceholder;
exports.scanLine = scanLine;
exports.scanContent = scanContent;
exports.SECRET_PATTERNS = [
    { id: "aws-access-key-id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
    { id: "private-key-block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { id: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/ },
    { id: "gitlab-token", regex: /\bglpat-[0-9A-Za-z_-]{20,}\b/ },
    { id: "slack-token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
    { id: "stripe-key", regex: /\b(sk|pk)_(live|test)_[0-9A-Za-z]{24,}\b/ },
    { id: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
    { id: "openai-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    {
        id: "generic-assignment",
        regex: /\b(password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token)\b['"]?\s*[:=]\s*['"][^'"\s]{16,}['"]/i,
    },
];
const PLACEHOLDER_WORDS = ["changeme", "example", "placeholder", "dummy", "redacted"];
/**
 * Placeholder heuristics: values that look like templates or documented
 * examples are not findings.
 */
function isPlaceholder(value) {
    const v = value.toLowerCase();
    if (/\$\{[^}]*\}/.test(v))
        return true;
    if (/\{\{[^}]*\}\}/.test(v))
        return true;
    if (/<[^>]*>/.test(v))
        return true;
    if (/x{5,}/.test(v))
        return true;
    for (const w of PLACEHOLDER_WORDS) {
        if (v.includes(w))
            return true;
    }
    if (v.startsWith("your"))
        return true;
    return false;
}
/** Extract the quoted value from a generic-assignment match. */
function extractQuotedValue(match) {
    const m = /['"]([^'"\s]+)['"]\s*$/.exec(match);
    return m !== null ? m[1] : null;
}
/** Scan one line of text; returns findings for that line (line passed through). */
function scanLine(text, line) {
    const findings = [];
    for (const p of exports.SECRET_PATTERNS) {
        const re = new RegExp(p.regex.source, p.regex.flags.includes("g") ? p.regex.flags : p.regex.flags + "g");
        let m = re.exec(text);
        while (m !== null) {
            const matched = m[0];
            if (matched.length === 0) {
                re.lastIndex++;
                m = re.exec(text);
                continue;
            }
            if (p.id === "openai-key") {
                // stripe keys have their own pattern; never double-report them
                if (matched.startsWith("sk_live_") || matched.startsWith("sk_test_")) {
                    m = re.exec(text);
                    continue;
                }
            }
            if (p.id === "generic-assignment") {
                const value = extractQuotedValue(matched);
                if (value !== null && isPlaceholder(value)) {
                    m = re.exec(text);
                    continue;
                }
            }
            else if (isPlaceholder(matched)) {
                m = re.exec(text);
                continue;
            }
            findings.push({
                patternId: p.id,
                matchedText: matched,
                preview: matched.slice(0, 8) + "…",
                line,
            });
            m = re.exec(text);
        }
    }
    return findings;
}
/** Scan a whole file's content (already decoded as UTF-8 text). */
function scanContent(content) {
    const findings = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        for (const f of scanLine(lines[i], i + 1)) {
            findings.push(f);
        }
    }
    return findings;
}
