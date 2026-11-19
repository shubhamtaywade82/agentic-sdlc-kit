// packages/core/src/specification/parser.ts
//
// Parses FeatureSpecification and BDD scenarios from JSON or Markdown.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Errors,
  type BddScenario,
  type FeatureSpecification,
  type Result,
} from '@agentic-sdlc-kit/contracts';
import { validateSpecification } from './validator.js';

function extractSections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = md.split('\n');
  let currentKey = 'header';
  let buffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (buffer.length > 0) sections.set(currentKey, buffer.join('\n').trim());
      currentKey = line
        .replace(/^##\s+/, '')
        .trim()
        .toLowerCase();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) sections.set(currentKey, buffer.join('\n').trim());
  return sections;
}

function parseListItems(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') || l.startsWith('* '))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

function parseScope(scopeText: string | undefined): { in: string[]; out: string[] } {
  if (!scopeText) return { in: [], out: [] };
  const inIdx = scopeText.toLowerCase().indexOf('in scope');
  const outIdx = scopeText.toLowerCase().indexOf('out of scope');

  if (inIdx !== -1 && outIdx !== -1) {
    const inPart = outIdx > inIdx ? scopeText.slice(inIdx, outIdx) : scopeText.slice(inIdx);
    const outPart = outIdx > inIdx ? scopeText.slice(outIdx) : scopeText.slice(outIdx, inIdx);
    return { in: parseListItems(inPart), out: parseListItems(outPart) };
  }
  return { in: parseListItems(scopeText), out: [] };
}

function parseIdStatements(items: string[]): Array<{ id: string; statement: string }> {
  return items.map((item, index) => {
    const match = /^([A-Z0-9_-]+):\s*(.+)$/.exec(item);
    if (match && match[1] && match[2]) {
      return { id: match[1], statement: match[2] };
    }
    return { id: `REQ-${String(index + 1).padStart(3, '0')}`, statement: item };
  });
}

function parseAcceptance(items: string[]): Array<{ id: string; criterion: string }> {
  return items.map((item, index) => {
    const match = /^([A-Z0-9_-]+):\s*(.+)$/.exec(item);
    if (match && match[1] && match[2]) {
      return { id: match[1], criterion: match[2] };
    }
    return { id: `ACC-${String(index + 1).padStart(3, '0')}`, criterion: item };
  });
}

function parseRisks(items: string[]): FeatureSpecification['risks'] {
  return items.map((item, index) => {
    const match = /^([A-Z0-9_-]+)\s*\((low|medium|high)\):\s*(.+)$/i.exec(item);
    if (match && match[1] && match[2] && match[3]) {
      const severity = match[2].toLowerCase() as 'low' | 'medium' | 'high';
      return { id: match[1], severity, description: match[3] };
    }
    return {
      id: `RISK-${String(index + 1).padStart(3, '0')}`,
      severity: 'medium',
      description: item,
    };
  });
}

function parseOpenQuestions(items: string[]): FeatureSpecification['openQuestions'] {
  return items.map((item, index) => {
    const match = /^([A-Z0-9_-]+):\s*(.+?)(?:\s*\((resolved|open|true|false)\))?$/i.exec(item);
    if (match && match[1] && match[2]) {
      const res = match[3]?.toLowerCase();
      const resolved = res === 'resolved' || res === 'true';
      return { id: match[1], question: match[2], resolved };
    }
    return { id: `Q-${String(index + 1).padStart(3, '0')}`, question: item, resolved: false };
  });
}

function parseActors(items: string[]): FeatureSpecification['actors'] {
  return items.map((item) => {
    const parts = item.split(':');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { name: parts[0].trim(), role: parts.slice(1).join(':').trim() };
    }
    return { name: item, role: 'User' };
  });
}

export function parseSpecificationMarkdown(md: string): Result<FeatureSpecification> {
  const sections = extractSections(md);
  const header = sections.get('header') ?? '';
  const titleMatch = /^#\s+([A-Z]+-[0-9]+):\s*(.+)$/m.exec(header);
  const id = titleMatch?.[1] ?? 'FEATURE-001';
  const title = titleMatch?.[2]?.trim() ?? 'Untitled Feature';

  const candidate: FeatureSpecification = {
    id,
    title,
    overview: sections.get('overview') ?? '',
    problem: sections.get('problem') ?? '',
    scope: parseScope(sections.get('scope')),
    actors: parseActors(parseListItems(sections.get('actors'))),
    functionalRequirements: parseIdStatements(
      parseListItems(sections.get('functional requirements')),
    ),
    nonFunctionalRequirements: parseIdStatements(
      parseListItems(sections.get('non-functional requirements')),
    ),
    acceptanceCriteria: parseAcceptance(parseListItems(sections.get('acceptance criteria'))),
    edgeCases: parseListItems(sections.get('edge cases')),
    dependencies: parseListItems(sections.get('dependencies')),
    risks: parseRisks(parseListItems(sections.get('risks'))),
    openQuestions: parseOpenQuestions(parseListItems(sections.get('open questions'))),
  };

  return validateSpecification(candidate);
}

export function parseBddScenarios(gherkinText: string): BddScenario[] {
  const scenarios: BddScenario[] = [];
  const lines = gherkinText.split('\n');
  let currentFeature = 'Feature';
  let currentScenario: BddScenario | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Feature:')) {
      currentFeature = trimmed.replace(/^Feature:\s*/, '');
    } else if (trimmed.startsWith('Scenario:')) {
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = {
        feature: currentFeature,
        scenario: trimmed.replace(/^Scenario:\s*/, ''),
        given: [],
        when: [],
        then: [],
      };
    } else if (currentScenario && trimmed.startsWith('Given ')) {
      currentScenario.given.push(trimmed.replace(/^Given\s+/, ''));
    } else if (currentScenario && trimmed.startsWith('When ')) {
      currentScenario.when.push(trimmed.replace(/^When\s+/, ''));
    } else if (currentScenario && trimmed.startsWith('Then ')) {
      currentScenario.then.push(trimmed.replace(/^Then\s+/, ''));
    }
  }
  if (currentScenario) scenarios.push(currentScenario);
  return scenarios;
}

export async function loadSpecification(targetPath: string): Promise<Result<FeatureSpecification>> {
  try {
    const stat = await fs.stat(targetPath);
    let filePath = targetPath;
    if (stat.isDirectory()) {
      filePath = path.join(targetPath, 'SPEC.md');
      const exists = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        filePath = path.join(targetPath, 'spec.json');
      }
    }

    const content = await fs.readFile(filePath, 'utf8');
    if (filePath.endsWith('.json')) {
      return validateSpecification(JSON.parse(content));
    }
    return parseSpecificationMarkdown(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: Errors.specInvalid(`Failed to load specification from ${targetPath}: ${msg}`),
    };
  }
}
