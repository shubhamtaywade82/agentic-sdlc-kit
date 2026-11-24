// tools/ci-agent/src/diff-parser.ts
//
// Unified-diff parsing with RIGHT-side line-number tracking, so review
// findings can be anchored to lines that actually exist in the PR's diff
// (inline review comments require a line present on the right side of a
// hunk) and so the prompt only shows the model valid anchors.

export interface DiffLine {
  readonly kind: 'add' | 'del' | 'ctx';
  readonly content: string;
  readonly newLine: number | null;
  readonly oldLine: number | null;
}

export interface DiffHunk {
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: readonly DiffLine[];
}

export interface DiffFile {
  readonly path: string;
  readonly oldPath: string | null;
  readonly isBinary: boolean;
  readonly isRename: boolean;
  readonly hunks: readonly DiffHunk[];
  readonly additions: number;
  readonly deletions: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Internal mutable builder shape (converted to DiffFile on output). */
interface Builder {
  path: string;
  oldPath: string | null;
  isBinary: boolean;
  isRename: boolean;
  hunks: Array<{ oldStart: number; newStart: number; lines: DiffLine[] }>;
  additions: number;
  deletions: number;
}

export function parseUnifiedDiff(diff: string): readonly DiffFile[] {
  const builders: Builder[] = [];
  let current: Builder | null = null;
  let currentLines: DiffLine[] | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      // diff --git a/<old> b/<new> — the b/ side names the file path.
      const bSide = raw.split(' b/')[1] ?? '';
      current = {
        path: bSide.trim(),
        oldPath: null,
        isBinary: false,
        isRename: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      builders.push(current);
      currentLines = null;
      continue;
    }
    if (current === null) continue;

    if (raw.startsWith('@@')) {
      const match = HUNK_HEADER.exec(raw);
      oldLine = match !== null ? Number(match[1]) : 0;
      newLine = match !== null ? Number(match[2]) : 0;
      currentLines = [];
      current.hunks.push({ oldStart: oldLine, newStart: newLine, lines: currentLines });
      continue;
    }

    if (
      raw.startsWith('index ') ||
      raw.startsWith('similarity index ') ||
      raw.startsWith('dissimilarity index ') ||
      raw.startsWith('old mode ') ||
      raw.startsWith('new mode ') ||
      raw.startsWith('new file mode ') ||
      raw.startsWith('deleted file mode ') ||
      raw.startsWith('Binary files ') ||
      raw.startsWith('GIT binary patch') ||
      raw.startsWith('\\ No newline at end of file') ||
      raw === ''
    ) {
      if (raw.startsWith('Binary files ') || raw.startsWith('GIT binary patch')) {
        current.isBinary = true;
      }
      continue;
    }

    if (raw.startsWith('rename to ')) {
      current.isRename = true;
      current.path = raw.slice('rename to '.length);
      continue;
    }
    if (raw.startsWith('rename from ')) {
      current.isRename = true;
      current.oldPath = raw.slice('rename from '.length);
      continue;
    }
    if (raw.startsWith('copy to ')) {
      current.path = raw.slice('copy to '.length);
      continue;
    }
    if (raw.startsWith('--- ')) {
      const side = raw.slice('--- '.length);
      if (side !== '/dev/null') current.oldPath = side.startsWith('a/') ? side.slice(2) : side;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const side = raw.slice('+++ '.length);
      if (side !== '/dev/null') current.path = side.startsWith('b/') ? side.slice(2) : side;
      continue;
    }

    if (currentLines === null) continue;

    if (raw.startsWith('+')) {
      currentLines.push({ kind: 'add', content: raw.slice(1), newLine, oldLine: null });
      newLine++;
      current.additions++;
    } else if (raw.startsWith('-')) {
      currentLines.push({ kind: 'del', content: raw.slice(1), newLine: null, oldLine });
      oldLine++;
      current.deletions++;
    } else if (raw.startsWith(' ') || raw === '') {
      currentLines.push({ kind: 'ctx', content: raw.slice(1), newLine, oldLine });
      newLine++;
      oldLine++;
    }
  }

  return builders
    .filter((b) => b.path !== '')
    .map<DiffFile>((b) => ({
      path: b.path,
      oldPath: b.oldPath,
      isBinary: b.isBinary,
      isRename: b.isRename,
      hunks: b.hunks,
      additions: b.additions,
      deletions: b.deletions,
    }));
}

/** The RIGHT-side line numbers that exist in this file's diff (inline anchors). */
export function rightSideLines(file: DiffFile): ReadonlySet<number> {
  const set = new Set<number>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.newLine !== null) set.add(line.newLine);
    }
  }
  return set;
}

/** Cost discipline: at most `cap` files per review; the rest are reported. */
export function capFiles(
  files: readonly DiffFile[],
  cap: number,
): { readonly files: readonly DiffFile[]; readonly skipped: number } {
  return { files: files.slice(0, cap), skipped: Math.max(0, files.length - cap) };
}

/** Render one file's diff for the model, with RIGHT-side anchors. */
export function renderFileForPrompt(file: DiffFile, maxChars: number): string {
  const head = `File: ${file.path} (+${file.additions} -${file.deletions})${
    file.isBinary ? ' [binary]' : ''
  }${file.isRename ? ' [rename]' : ''}`;
  const body: string[] = [];
  let used = head.length;
  for (const hunk of file.hunks) {
    const header = `@@ -${hunk.oldStart} +${hunk.newStart} @@`;
    body.push(header);
    used += header.length;
    for (const line of hunk.lines) {
      const anchor = line.newLine !== null ? `L${line.newLine}` : '  -';
      const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
      const rendered = `${anchor} ${marker}${line.content}`;
      used += rendered.length;
      if (used > maxChars) {
        body.push('…(diff truncated for this file)');
        return [head, ...body].join('\n');
      }
      body.push(rendered);
    }
  }
  return [head, ...body].join('\n');
}
