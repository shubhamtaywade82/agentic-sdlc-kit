// packages/core/src/planning/adr.ts
//
// Generates and manages Architecture Decision Records (ADR).

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface AdrOptions {
  readonly number: number;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly consequences: string[];
  readonly status?: 'proposed' | 'accepted' | 'superseded';
}

export function formatAdr(options: AdrOptions): string {
  const padNum = String(options.number).padStart(4, '0');
  const status = options.status ?? 'proposed';
  const consequences = options.consequences.map((c) => `- ${c}`).join('\n');

  return `# ADR-${padNum}: ${options.title}

## Status
${status}

## Context
${options.context}

## Decision
${options.decision}

## Consequences
${consequences}
`;
}

export async function createAdr(dir: string, options: AdrOptions): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const padNum = String(options.number).padStart(4, '0');
  const slug = options.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const filename = `ADR-${padNum}-${slug}.md`;
  const fullPath = path.join(dir, filename);

  const content = formatAdr(options);
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}
