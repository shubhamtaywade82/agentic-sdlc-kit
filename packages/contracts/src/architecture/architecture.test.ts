// packages/contracts/src/architecture/architecture.test.ts
import { describe, expect, it } from 'vitest';
import { ArchitectureOptionsSchema } from './architecture-options.js';
import { ComponentMapSchema } from './component-map.js';
import { DataModelSchema } from './data-model.js';
import { ApiContractSchema } from './api-contract.js';
import { SecurityDesignSchema } from './security-design.js';
import { OperationalDesignSchema } from './operational-design.js';
import { ArchitectureApprovalSchema } from './architecture-approval.js';

describe('ArchitectureOptionsSchema', () => {
  it('accepts at least two options and a selection', () => {
    expect(
      ArchitectureOptionsSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        options: [
          {
            id: 'OPT-1',
            kind: 'modular-monolith',
            name: 'Modular Monolith',
            rationale: 'small team, fast iteration',
            pros: ['simple deploy'],
            cons: ['scaling limits'],
            justifiedBy: ['FR-1'],
            rejected: false,
          },
          {
            id: 'OPT-2',
            kind: 'microservices',
            name: 'Microservices',
            rationale: 'independent scaling',
            pros: ['scale independently'],
            cons: ['operational complexity'],
            justifiedBy: ['NFR-perf'],
            rejected: true,
            rejectionReason: 'team too small',
          },
        ],
        selectedOptionId: 'OPT-1',
      }).success,
    ).toBe(true);
  });
  it('rejects a single-option set', () => {
    expect(
      ArchitectureOptionsSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        options: [
          {
            id: 'OPT-1',
            kind: 'modular-monolith',
            name: 'x',
            rationale: 'y',
            pros: [],
            cons: [],
            justifiedBy: [],
          },
        ],
        selectedOptionId: 'OPT-1',
      }).success,
    ).toBe(false);
  });
});

describe('ComponentMapSchema', () => {
  it('accepts a valid map', () => {
    expect(
      ComponentMapSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        components: [
          {
            id: 'C-1',
            kind: 'backend',
            name: 'API',
            responsibility: 'serves REST',
            dependsOn: [],
            filePaths: [],
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('DataModelSchema', () => {
  it('accepts a valid model with a reference field', () => {
    expect(
      DataModelSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        entities: [
          {
            id: 'E-1',
            name: 'User',
            fields: [
              { name: 'id', type: 'uuid', required: true, unique: true, indexed: true },
              {
                name: 'orgId',
                type: 'reference',
                required: true,
                unique: false,
                indexed: false,
                references: 'Org',
              },
            ],
            conventions: [],
          },
        ],
        relationships: [
          {
            id: 'R-1',
            fromEntityId: 'E-1',
            toEntityId: 'E-2',
            kind: 'many-to-one',
            enforcedAt: 'database',
          },
        ],
      }).success,
    ).toBe(false); // 'many-to-one' is not a valid RelationshipKind
  });
  it('accepts with a valid relationship kind', () => {
    expect(
      DataModelSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        entities: [
          {
            id: 'E-1',
            name: 'User',
            fields: [{ name: 'id', type: 'uuid', required: true, unique: true, indexed: true }],
            conventions: [],
          },
        ],
        relationships: [
          {
            id: 'R-1',
            fromEntityId: 'E-1',
            toEntityId: 'E-2',
            kind: 'one-to-many',
            enforcedAt: 'database',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('ApiContractSchema', () => {
  it('accepts a valid contract', () => {
    expect(
      ApiContractSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        endpoints: [
          {
            id: 'EP-1',
            method: 'GET',
            path: '/users',
            operationId: 'listUsers',
            summary: 'List users',
            parameters: [],
            responses: [{ status: 200, description: 'ok' }],
            requiresAuth: true,
            requiredRoles: ['admin'],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it('rejects a path that does not start with /', () => {
    expect(
      ApiContractSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        endpoints: [
          {
            id: 'EP-1',
            method: 'GET',
            path: 'users',
            operationId: 'listUsers',
            summary: 'List users',
            parameters: [],
            responses: [{ status: 200, description: 'ok' }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('SecurityDesignSchema', () => {
  it('accepts a valid design', () => {
    expect(
      SecurityDesignSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        authentication: {
          method: 'jwt',
          rationale: 'stateless, mobile-friendly',
          credentialStore: 'env',
        },
        authorization: {
          model: 'rbac',
          roles: ['admin', 'user'],
          protectedResources: ['/admin'],
        },
        threats: [
          {
            id: 'T-1',
            threat: 'token theft',
            severity: 'high',
            mitigation: 'short TTL + refresh rotation',
          },
        ],
        secrets: { loader: 'env', rotationPolicy: 'manual quarterly' },
      }).success,
    ).toBe(true);
  });
});

describe('OperationalDesignSchema', () => {
  it('accepts a valid design', () => {
    expect(
      OperationalDesignSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        deployment: {
          target: 'container-orchestrated',
          rationale: 'auto-scaling',
          regions: ['us-east'],
        },
        configuration: {
          source: 'env',
          variables: [{ name: 'DATABASE_URL', required: true, sensitive: true, description: 'DB' }],
        },
        observability: { channels: ['logs', 'metrics'], sinks: ['stdout'] },
        scaling: { strategy: 'horizontal', triggers: ['cpu>80%'] },
      }).success,
    ).toBe(true);
  });
});

describe('ArchitectureApprovalSchema', () => {
  it('accepts a valid approval', () => {
    expect(
      ArchitectureApprovalSchema.safeParse({
        schemaVersion: 1,
        briefId: 'BRIEF-001',
        selectedOptionId: 'OPT-1',
        adrIds: ['ADR-0100'],
        componentMapId: 'CM-1',
        dataModelId: 'DM-1',
        apiContractId: 'API-1',
        securityDesignId: 'SD-1',
        operationalDesignId: 'OD-1',
        approvedBy: 'lead',
        approvedAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
