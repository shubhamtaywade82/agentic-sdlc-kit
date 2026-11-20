// packages/cli/src/application/version.ts
//
// Single source of truth for the kit version. Sourced from package.json at
// build time via a build-time constant. In M1 we hard-code to keep the
// build simple; M16 wires this to a generated file.

export const VERSION = '0.7.2';
