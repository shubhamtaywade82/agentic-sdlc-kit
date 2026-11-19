// packages/contracts/src/scaffolding/template-manifest.ts
//
// Template manifest contract (M8 Phase D — M8-20, M8-21).
//
// A template is a versioned project skeleton. Templates live under
// `templates/<name>/` and are tested as actual applications in CI. The
// manifest declares what the template produces, what variables it expects,
// and what compatibility range it supports.
//
// Per post-M7 roadmap §2.3 Phase D: "These templates should be versioned
// and tested as actual applications. They must not become collections of
// stale snippets."

import { z } from 'zod';

export const TEMPLATE_MANIFEST_SCHEMA_VERSION = 1 as const;

export const TemplateVariableSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
  // Regex the value must match; e.g., project name format.
  pattern: z.string().optional(),
  defaultValue: z.string().optional(),
});

export const TemplateManifestSchema = z.object({
  schemaVersion: z.literal(TEMPLATE_MANIFEST_SCHEMA_VERSION),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'template id must be kebab-case'),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  // Stacks this template produces.
  stacks: z.array(z.string()).min(1),
  // Variables the template expects when rendered.
  variables: z.array(TemplateVariableSchema).default([]),
  // Files the template will generate (relative paths).
  files: z.array(
    z.object({
      path: z.string().min(1),
      // True if the file is a template (needs variable substitution).
      templated: z.boolean(),
      // True if the file should not be overwritten on re-generation.
      preserve: z.boolean().default(false),
    }),
  ),
  // Compatibility range for the kit itself.
  kitCompatibility: z.string().min(1),
});

export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
