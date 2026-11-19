// packages/core/src/project-profile/serializer.ts
//
// Deterministic YAML serializer and parser for ProjectProfile (.ai-kit/project.yml).
// Generates and parses clean YAML without external dependencies.

import { Errors, type ProjectProfile, type Result } from '@agentic-sdlc-kit/contracts';
import { validateProfile } from './validator.js';

export function serializeProfileToYaml(profile: ProjectProfile): string {
  const lines: string[] = [];
  lines.push(`schemaVersion: ${profile.schemaVersion}`);
  lines.push(`name: ${profile.name}`);
  lines.push('stack:');
  for (const s of profile.stack) {
    lines.push(`  - ${s}`);
  }

  const entries = Object.entries(profile.commands).filter(([, cmds]) => cmds && cmds.length > 0);
  if (entries.length === 0) {
    lines.push('commands: {}');
    return lines.join('\n') + '\n';
  }

  lines.push('commands:');
  for (const [category, cmds] of entries) {
    lines.push(`  ${category}:`);
    for (const cmd of cmds!) {
      lines.push(`    - ${JSON.stringify(cmd)}`);
    }
  }

  return lines.join('\n') + '\n';
}

export const serializeProfileYaml = serializeProfileToYaml;

function parseYamlLines(yaml: string): {
  schemaVersion: number;
  name: string;
  stack: string[];
  commands: ProjectProfile['commands'];
} {
  let schemaVersion = 1;
  let name = 'unnamed';
  const stack: string[] = [];
  const commands: ProjectProfile['commands'] = {};

  let currentCategory: string | null = null;
  const lines = yaml.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith('schemaVersion:')) {
      schemaVersion = Number.parseInt(line.replace('schemaVersion:', '').trim(), 10);
    } else if (line.startsWith('name:')) {
      name = line.replace('name:', '').trim();
    } else if (line.startsWith('  - ') && !currentCategory) {
      stack.push(line.replace('  - ', '').trim());
    } else if (line.startsWith('  ') && line.endsWith(':') && !line.startsWith('    ')) {
      currentCategory = line.trim().replace(':', '');
      if (currentCategory && !commands[currentCategory as keyof ProjectProfile['commands']]) {
        commands[currentCategory as keyof ProjectProfile['commands']] = [];
      }
    } else if (line.startsWith('    - ') && currentCategory) {
      const jsonStr = line.replace('    - ', '').trim();
      try {
        const parsedCmd = JSON.parse(jsonStr);
        if (Array.isArray(parsedCmd)) {
          commands[currentCategory as keyof ProjectProfile['commands']]?.push(parsedCmd);
        }
      } catch {
        // ignore malformed line
      }
    }
  }

  return { schemaVersion, name, stack, commands };
}

export function parseProfileFromYaml(yaml: string): Result<ProjectProfile> {
  try {
    const candidate = parseYamlLines(yaml);
    return validateProfile(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: Errors.profileInvalid(`Failed to parse profile YAML: ${msg}`) };
  }
}

export const parseProfileYaml = parseProfileFromYaml;
