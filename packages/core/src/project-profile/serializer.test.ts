// packages/core/src/project-profile/serializer.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectProfile } from '@agentic-sdlc-kit/contracts';
import { serializeProfileToYaml } from './serializer.js';

describe('serializeProfileToYaml', () => {
  it('serializes profile with commands correctly', () => {
    const profile: ProjectProfile = {
      schemaVersion: 1,
      name: 'sample-app',
      stack: ['node-typescript'],
      commands: {
        test: [['pnpm', 'test']],
        build: [['pnpm', 'build']],
      },
    };

    const yaml = serializeProfileToYaml(profile);
    expect(yaml).toContain('schemaVersion: 1');
    expect(yaml).toContain('name: sample-app');
    expect(yaml).toContain('  - node-typescript');
    expect(yaml).toContain('    - ["pnpm","test"]');
    expect(yaml).toContain('    - ["pnpm","build"]');
  });

  it('serializes profile with empty commands', () => {
    const profile: ProjectProfile = {
      schemaVersion: 1,
      name: 'empty-commands',
      stack: ['python'],
      commands: {},
    };

    const yaml = serializeProfileToYaml(profile);
    expect(yaml).toContain('commands: {}');
  });
});
