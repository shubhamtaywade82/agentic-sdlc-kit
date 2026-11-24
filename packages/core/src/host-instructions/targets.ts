// packages/core/src/host-instructions/targets.ts
//
// Where each host reads its standing instructions. Pure data + rendering:
// no filesystem access (the CLI applies targets).

import { featurePrompt, fixPrompt, protocolBlock, resumePrompt, skillBody } from './procedure.js';
import { withTrailer } from './managed.js';

export const HOST_IDS = ['claude-code', 'codex', 'cursor', 'agy', 'gemini', 'aider'] as const;
export type HostId = (typeof HOST_IDS)[number];
export type HostScope = 'user' | 'project';

export interface HostTarget {
  /** Relative to the home directory (user scope) or the project root (project scope). */
  readonly path: string;
  /** `file`: owned whole file. `block`: managed block inside a shared file. */
  readonly mode: 'file' | 'block';
  readonly content: string;
}

export const isHostId = (v: string): v is HostId => (HOST_IDS as readonly string[]).includes(v);

const file = (p: string, body: string): HostTarget => ({ path: p, mode: 'file', content: withTrailer(body) });
const block = (p: string, body: string): HostTarget => ({ path: p, mode: 'block', content: body });

function claudeCode(): HostTarget[] {
  const dir = '.claude';
  return [
    file(`${dir}/commands/kit-feature.md`, featurePrompt()),
    file(`${dir}/commands/kit-fix.md`, fixPrompt()),
    file(`${dir}/commands/kit-resume.md`, resumePrompt()),
    file(`${dir}/skills/agentic-sdlc-kit/SKILL.md`, skillBody('claude-code', 'agentic-sdlc-kit')),
  ];
}

const CURSOR_FRONTMATTER = ['---', 'description: agentic-sdlc-kit SDLC protocol', 'alwaysApply: true', '---', ''].join('\n');

/** Returns null when the host has no instruction surface at that scope. */
export function planHostTargets(host: HostId, scope: HostScope): HostTarget[] | null {
  switch (host) {
    case 'claude-code':
      return claudeCode();
    case 'codex':
      return [block(scope === 'user' ? '.codex/AGENTS.md' : 'AGENTS.md', protocolBlock('codex'))];
    case 'gemini':
      return [block(scope === 'user' ? '.gemini/GEMINI.md' : 'GEMINI.md', protocolBlock('gemini'))];
    case 'agy':
      return scope === 'user'
        ? [file('.gemini/skills/agentic-sdlc-kit/SKILL.md', skillBody('agy', 'agentic-sdlc-kit'))]
        : null;
    case 'cursor':
      return scope === 'project'
        ? [file('.cursor/rules/sdlc.mdc', CURSOR_FRONTMATTER + protocolBlock('cursor'))]
        : null;
    case 'aider':
      return scope === 'project' ? [block('CONVENTIONS.md', protocolBlock('aider'))] : null;
  }
}

/** Default scope per host: user where the host has a global surface, else project. */
export const DEFAULT_SCOPE: Record<HostId, HostScope> = {
  'claude-code': 'user',
  codex: 'user',
  gemini: 'user',
  agy: 'user',
  cursor: 'project',
  aider: 'project',
};
