// packages/cli/src/commands/attach-exclude.ts
//
// Managed block inside `.git/info/exclude`. Patterns carry NO trailing slash:
// a slash-suffixed gitignore pattern matches directories only and git treats
// a symlink as a file, so the symlinked (global) mode would leak.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const BLOCK_BEGIN = '# >>> kit-attach managed block >>>';
export const BLOCK_END = '# <<< kit-attach managed block <<<';

export function stripBlock(text: string): string {
  const out: string[] = [];
  let skip = false;
  for (const line of text.split('\n')) {
    if (line === BLOCK_BEGIN) skip = true;
    if (!skip) out.push(line);
    if (line === BLOCK_END) skip = false;
  }
  return out.join('\n');
}

export function withBlock(text: string, paths: readonly string[]): string {
  const base = stripBlock(text).replace(/\n*$/, '');
  const block = [BLOCK_BEGIN, ...paths, BLOCK_END].join('\n');
  return (base ? base + '\n' : '') + block + '\n';
}

async function readOrEmpty(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

export async function writeBlock(file: string, paths: readonly string[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, withBlock(await readOrEmpty(file), paths));
}

export async function removeBlock(file: string): Promise<void> {
  const text = await readOrEmpty(file);
  if (text.includes(BLOCK_BEGIN)) await fs.writeFile(file, stripBlock(text));
}

export async function hasBlock(file: string): Promise<boolean> {
  return (await readOrEmpty(file)).includes(BLOCK_BEGIN);
}
