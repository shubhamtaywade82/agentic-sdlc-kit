/**
 * Line-oriented markdown helpers for spec/plan/ADR validation.
 *
 * The kit only needs a small, deterministic subset: frontmatter delimiters,
 * ATX headings (`#`..`######`) and simple list items (`- ` / `* `).
 */

export interface MdLine {
  text: string;
  /** 1-based line number in the full file */
  line: number;
}

export interface Heading {
  level: number;
  text: string;
  /** 1-based line number in the full file */
  line: number;
}

export interface Frontmatter {
  /** raw YAML text between the `---` delimiters, or null when absent */
  text: string | null;
  /** true when an opening `---` was found but never closed */
  unterminated: boolean;
  /** 1-based line number of the first line after the closing `---` */
  bodyStartLine: number;
  /** 1-based line number of the first frontmatter content line (2 when present) */
  fmStartLine: number;
}

export function extractFrontmatter(text: string): Frontmatter {
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

export function toLines(text: string, fromLine: number = 1): MdLine[] {
  const result: MdLine[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    result.push({ text: lines[i], line: i + fromLine });
  }
  return result;
}

const HEADING_RE = /^(#{1,6}) (.*)$/;

/** Find all headings in the body (optionally starting at a given 1-based line). */
export function findHeadings(lines: MdLine[]): Heading[] {
  const headings: Heading[] = [];
  for (const ln of lines) {
    const m = HEADING_RE.exec(ln.text);
    if (m) {
      headings.push({ level: m[1].length, text: m[2].trim(), line: ln.line });
    }
  }
  return headings;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find a heading by (case-insensitive, whitespace-normalized) exact title. */
export function headingByTitle(headings: Heading[], level: number, title: string): Heading | undefined {
  const wanted = normalizeTitle(title);
  return headings.find((h) => h.level === level && normalizeTitle(h.text) === wanted);
}

/**
 * Body lines of a section: everything after its heading until the next
 * heading of the same or a lower level.
 */
export function sectionLines(heading: Heading, headings: Heading[], lines: MdLine[]): MdLine[] {
  const end = headings.find((h) => h.line > heading.line && h.level <= heading.level);
  const endLine = end !== undefined ? end.line : Number.MAX_SAFE_INTEGER;
  return lines.filter((ln) => ln.line > heading.line && ln.line < endLine);
}

const ITEM_RE = /^[-*] (.*)$/;

/** All list items (`- ` / `* `) among the given lines. */
export function listItems(lines: MdLine[]): MdLine[] {
  return lines.filter((ln) => ITEM_RE.test(ln.text));
}

export function itemText(ln: MdLine): string {
  const m = ITEM_RE.exec(ln.text);
  return m !== null ? m[1].trim() : ln.text.trim();
}
