// packages/contracts/src/scaffolding/scaffold-contract.test.ts
import { describe, expect, it } from 'vitest';
import {
  ScaffoldPlanSchema,
  ScaffoldRequestSchema,
  ScaffoldResultSchema,
} from './scaffold-contract.js';
import { TemplateManifestSchema } from './template-manifest.js';

const validManifest = {
  schemaVersion: 1,
  id: 'node-typescript-api',
  name: 'Node TypeScript API',
  description: 'Express + TypeScript starter.',
  version: '1.0.0',
  stacks: ['node-typescript'],
  variables: [{ name: 'projectName', description: 'Package name', required: true }],
  files: [{ path: 'package.json', templated: true, preserve: false }],
  kitCompatibility: '>=0.6.0',
};

describe('TemplateManifestSchema', () => {
  it('accepts a valid manifest', () => {
    expect(TemplateManifestSchema.safeParse(validManifest).success).toBe(true);
  });
  it('rejects a non-semver version', () => {
    expect(TemplateManifestSchema.safeParse({ ...validManifest, version: 'latest' }).success).toBe(
      false,
    );
  });
  it('rejects an invalid id (must be kebab-case)', () => {
    expect(TemplateManifestSchema.safeParse({ ...validManifest, id: 'Node_TS' }).success).toBe(
      false,
    );
  });
});

const validRequest = {
  templateId: 'node-typescript-api',
  templateVersion: '1.0.0',
  targetDir: '/tmp/new-app',
  variables: { projectName: 'new-app' },
  execute: false,
};

describe('ScaffoldRequestSchema', () => {
  it('accepts a valid request', () => {
    expect(ScaffoldRequestSchema.safeParse(validRequest).success).toBe(true);
  });
  it('rejects an empty targetDir', () => {
    expect(ScaffoldRequestSchema.safeParse({ ...validRequest, targetDir: '' }).success).toBe(false);
  });
});

describe('ScaffoldPlanSchema', () => {
  it('accepts a valid plan', () => {
    expect(
      ScaffoldPlanSchema.safeParse({
        schemaVersion: 1,
        request: validRequest,
        template: validManifest,
        plannedOperations: [
          { path: 'package.json', kind: 'create' },
          { path: 'README.md', kind: 'create' },
        ],
        validationErrors: [],
      }).success,
    ).toBe(true);
  });
});

describe('ScaffoldResultSchema', () => {
  it('accepts a valid result with executed ops and owned files', () => {
    expect(
      ScaffoldResultSchema.safeParse({
        schemaVersion: 1,
        plan: {
          schemaVersion: 1,
          request: validRequest,
          template: validManifest,
          plannedOperations: [{ path: 'package.json', kind: 'create' }],
          validationErrors: [],
        },
        executedOperations: [{ path: 'package.json', kind: 'create', bytesWritten: 100 }],
        ownedFiles: ['package.json'],
        interrupted: false,
      }).success,
    ).toBe(true);
  });
  it('accepts an interrupted result (recovery scenario)', () => {
    expect(
      ScaffoldResultSchema.safeParse({
        schemaVersion: 1,
        plan: {
          schemaVersion: 1,
          request: validRequest,
          template: validManifest,
          plannedOperations: [{ path: 'package.json', kind: 'create' }],
          validationErrors: [],
        },
        executedOperations: [],
        ownedFiles: [],
        interrupted: true,
      }).success,
    ).toBe(true);
  });
});
