// packages/contracts/src/installer/ownership-manifest.ts
//
// M15 ownership manifest (M15-06). Tracks which files the kit owns in a
// target installation so uninstall (M15-09) removes only kit-owned files.

import { z } from 'zod';

export const OWNERSHIP_MANIFEST_SCHEMA_VERSION = 1 as const;

export const OwnershipEntrySchema = z.object({
  // The package that owns this file.
  packageId: z.string(),
  packageVersion: z.string(),
  // The relative path within the target installation.
  path: z.string().min(1),
  // SHA-256 of the file content at install time (so we can detect
  // modifications by the user).
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  // When the file was installed.
  installedAt: z.string(),
  // Whether the file was preserved (not overwritten) on upgrade.
  preserved: z.boolean().default(false),
  // For symlink entries: the absolute path the link pointed to when the kit
  // created or verified it. Uninstall removes the link only while it still
  // points here. Absent on manifests written before this field existed.
  target: z.string().optional(),
});

export const OwnershipManifestSchema = z.object({
  schemaVersion: z.literal(OWNERSHIP_MANIFEST_SCHEMA_VERSION),
  // The installation root.
  root: z.string().min(1),
  // The scope: project (relative to a project root) or user (relative to
  // a user home directory).
  scope: z.enum(['project', 'user']),
  entries: z.array(OwnershipEntrySchema),
});

export type OwnershipEntry = z.infer<typeof OwnershipEntrySchema>;
export type OwnershipManifest = z.infer<typeof OwnershipManifestSchema>;
