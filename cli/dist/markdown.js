"use strict";
/**
 * Line-oriented markdown helpers for spec/plan/ADR validation.
 *
 * The kit only needs a small, deterministic subset: frontmatter delimiters,
 * ATX headings (`#`..`######`) and simple list items (`- ` / `* `).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFrontmatter = extractFrontmatter;
exports.toLines = toLines;
exports.findHeadings = findHeadings;
exports.headingByTitle = headingByTitle;
exports.sectionLines = sectionLines;
exports.listItems = listItems;
exports.itemText = itemText;
function extractFrontmatter(text) {
    const lines = text.split(/\r?\n/);
    const first = lines[0] !== undefined ? lines[0].trim() : "";
    if (first !== "---") {
        return { text: null, unterminated: false, bodyStartLine: 1, fmStartLine: 1 };
    }
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            return {
                text: lines.slice(1, i).join("\n"),
                unterminated: false,
                bodyStartLine: i + 2,
                fmStartLine: 2,
            };
        }
    }
    return { text: lines.slice(1).join("\n"), unterminated: true, bodyStartLine: 1, fmStartLine: 2 };
}
function toLines(text, fromLine = 1) {
    const result = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        result.push({ text: lines[i], line: i + fromLine });
    }
    return result;
}
const HEADING_RE = /^(#{1,6}) (.*)$/;
/** Find all headings in the body (optionally starting at a given 1-based line). */
function findHeadings(lines) {
    const headings = [];
    for (const ln of lines) {
        const m = HEADING_RE.exec(ln.text);
        if (m) {
            headings.push({ level: m[1].length, text: m[2].trim(), line: ln.line });
        }
    }
    return headings;
}
function normalizeTitle(title) {
    return title.trim().toLowerCase().replace(/\s+/g, " ");
}
/** Find a heading by (case-insensitive, whitespace-normalized) exact title. */
function headingByTitle(headings, level, title) {
    const wanted = normalizeTitle(title);
    return headings.find((h) => h.level === level && normalizeTitle(h.text) === wanted);
}
/**
 * Body lines of a section: everything after its heading until the next
 * heading of the same or a lower level.
 */
function sectionLines(heading, headings, lines) {
    const end = headings.find((h) => h.line > heading.line && h.level <= heading.level);
    const endLine = end !== undefined ? end.line : Number.MAX_SAFE_INTEGER;
    return lines.filter((ln) => ln.line > heading.line && ln.line < endLine);
}
const ITEM_RE = /^[-*] (.*)$/;
/** All list items (`- ` / `* `) among the given lines. */
function listItems(lines) {
    return lines.filter((ln) => ITEM_RE.test(ln.text));
}
function itemText(ln) {
    const m = ITEM_RE.exec(ln.text);
    return m !== null ? m[1].trim() : ln.text.trim();
}
