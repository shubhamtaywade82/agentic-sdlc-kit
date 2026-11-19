// packages/contracts/src/installer/package-manifest.ts
//
// M15 package manifest (M15-01) and installation profiles (M15-02).

import { z } from 'zod';

export const INSTALLER_SCHEMA_VERSION = 1 as const;

export const InstallationProfileSchema = z.enum([
  'minimal',
  'full-sdlc',
  'runtime',
  'stack-specific',
]);

export const PackageManifestSchema = z.object({
  schemaVersion: z.literal(INSTALLER_SCHEMA_VERSION),
  // The package id (e.g., "sdlc-guard", "node-typescript-pack").
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  // Human-readable name.
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  description: z.string().min(1),
  // What kind of package this is.
  kind: z.enum([
    'core',
    'mod',
    'skill-pack',
    'agent-pack',
    'command-pack',
    'stack-pack',
    'pattern-pack',
    'policy-pack',
  ]),
  // Which profiles include this package by default.
  profiles: z.array(InstallationProfileSchema).default([]),
  // Required kit compatibility.
  kitCompatibility: z.string().min(1),
  // Files this package owns (relative paths within the target installation).
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        // True if the file should never be overwritten on upgrade.
        preserve: z.boolean().default(false),
      }),
    )
    .default([]),
  // Dependencies on other packages.
  dependsOn: z.array(z.string()).default([]),
});

export type PackageManifest = z.infer<typeof PackageManifestSchema>;
export type InstallationProfile = z.infer<typeof InstallationProfileSchema>;
