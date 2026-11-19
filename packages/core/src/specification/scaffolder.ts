// packages/core/src/specification/scaffolder.ts
//
// Scaffolds specification directory templates matching the M3 specification structure.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ScaffoldOptions {
  readonly id: string;
  readonly title: string;
  readonly targetDir: string;
}

export function generateSpecMarkdown(id: string, title: string): string {
  return `# ${id}: ${title}

## Overview
Brief overview of what this feature accomplishes.

## Problem
Describe the user problem, engineering defect, or business need.

## Scope
### In Scope
- Primary capability 1
- Primary capability 2

### Out of Scope
- Future expansion 1

## Actors
- EndUser: Regular application user
- SystemService: Internal service actor

## Functional Requirements
- REQ-001: System shall perform primary capability 1
- REQ-002: System shall perform primary capability 2

## Non-Functional Requirements
- NFR-001: Execution latency must be under 200ms

## Acceptance Criteria
- ACC-001: Verified response returned for valid inputs
- ACC-002: Rejected with clear error message for invalid inputs

## Edge Cases
- Network disconnection during submission
- Empty or malformed input payload

## Dependencies
- Upstream service or database dependency

## Risks
- RISK-001 (low): Minor operational friction during migration

## Open Questions
- Q-001: Required retention duration? (resolved: true)
`;
}

export function generateScenariosMarkdown(title: string): string {
  return `Feature: ${title}

  Scenario: Successful flow
    Given the system is initialized and ready
    When valid parameters are provided
    Then the action should succeed completely

  Scenario: Validation rejection
    Given the system is initialized and ready
    When an invalid parameter is provided
    Then the request should be rejected with an error
`;
}

export async function scaffoldSpecification(options: ScaffoldOptions): Promise<string> {
  const featureDir = path.join(options.targetDir, options.id);
  await fs.mkdir(featureDir, { recursive: true });

  const specPath = path.join(featureDir, 'SPEC.md');
  const scenariosPath = path.join(featureDir, 'SCENARIOS.md');
  const acceptancePath = path.join(featureDir, 'ACCEPTANCE.md');
  const notesPath = path.join(featureDir, 'NOTES.md');

  await fs.writeFile(specPath, generateSpecMarkdown(options.id, options.title), 'utf8');
  await fs.writeFile(scenariosPath, generateScenariosMarkdown(options.title), 'utf8');
  await fs.writeFile(
    acceptancePath,
    `# Acceptance Criteria for ${options.id}\n\nSee SPEC.md.\n`,
    'utf8',
  );
  await fs.writeFile(
    notesPath,
    `# Engineering Notes for ${options.id}\n\nTechnical notes and context.\n`,
    'utf8',
  );

  return featureDir;
}
