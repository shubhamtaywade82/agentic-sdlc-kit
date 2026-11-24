// VENDORED verbatim from plugins/sdlc-guard/policies/command-parser.ts (everything
// below this header). A Mods hooks module may import only its own files, so the
// plugin cannot share it. tests/git-command.test.ts fails if the two copies drift.

// plugins/sdlc-guard/policies/command-parser.ts
//
// Splits a Bash command string into simple commands (argv arrays). Policy
// matches tokens, never substrings: a regex over the raw string cannot tell
// `rm -r -f dist` (destructive) from `echo "rm -rf"` (harmless), and cannot
// see flags split across words.
//
// Deliberately small: it honors single/double quotes and backslash escapes,
// and treats ; && || | & newline ( ) and backticks as command boundaries.
// It does not expand variables, globs or $(...) results. Whatever it cannot
// see is covered by the host's approval flow, not by this classifier.

export interface SimpleCommand {
  argv: string[];
  /** True when this command reads from a pipe (`x | this`). */
  piped: boolean;
}

type Token = { kind: 'word'; value: string } | { kind: 'sep'; value: 'pipe' | 'seq' };

function isBlank(c: string): boolean {
  return c === ' ' || c === '\t';
}

function readQuoted(input: string, start: number, quote: string): [string, number] {
  let out = '';
  let i = start;
  while (i < input.length && input[i] !== quote) {
    if (quote === '"' && input[i] === '\\' && i + 1 < input.length) {
      out += input[i + 1];
      i += 2;
      continue;
    }
    out += input[i];
    i += 1;
  }
  return [out, i + 1];
}

/** Separator at position i: returns the token kind and how many chars it spans. */
function separatorAt(input: string, i: number): { value: 'pipe' | 'seq'; width: number } | null {
  const c = input[i];
  if (c === '|') {
    if (input[i + 1] === '|') return { value: 'seq', width: 2 };
    if (input[i + 1] === '&') return { value: 'pipe', width: 2 };
    return { value: 'pipe', width: 1 };
  }
  if (c === '&') return { value: 'seq', width: input[i + 1] === '&' ? 2 : 1 };
  if (c === ';' || c === '(' || c === ')' || c === '`' || c === '\n') {
    return { value: 'seq', width: 1 };
  }
  return null;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let word = '';
  let inWord = false;
  const flush = (): void => {
    if (inWord) tokens.push({ kind: 'word', value: word });
    word = '';
    inWord = false;
  };
  let i = 0;
  while (i < input.length) {
    const c = input[i] as string;
    if (c === '"' || c === "'") {
      const [text, next] = readQuoted(input, i + 1, c);
      word += text;
      inWord = true;
      i = next;
      continue;
    }
    if (c === '\\' && i + 1 < input.length) {
      word += input[i + 1];
      inWord = true;
      i += 2;
      continue;
    }
    const sep = separatorAt(input, i);
    if (sep) {
      flush();
      tokens.push({ kind: 'sep', value: sep.value });
      i += sep.width;
      continue;
    }
    if (isBlank(c) || c === '\r') {
      flush();
    } else {
      word += c;
      inWord = true;
    }
    i += 1;
  }
  flush();
  return tokens;
}

export function parseCommand(input: string): SimpleCommand[] {
  const commands: SimpleCommand[] = [];
  let argv: string[] = [];
  let piped = false;
  const endCommand = (): void => {
    if (argv.length > 0) commands.push({ argv, piped });
    argv = [];
  };
  for (const token of tokenize(input)) {
    if (token.kind === 'word') {
      argv.push(token.value);
      continue;
    }
    endCommand();
    piped = token.value === 'pipe';
  }
  endCommand();
  return commands;
}
