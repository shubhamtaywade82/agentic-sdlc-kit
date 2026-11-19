// packages/mod-sdk/src/capabilities/analyzer.ts
//
// Static capability analyzer. Parses a Mod's register.ts source to extract
// declared events and API calls, then compares against the declared
// ModCapabilities manifest.
//
// This is a lightweight text-based analyzer; it does not load the module.
// It looks for `on('event.name', ...)` and `$.namespace.method(...)` calls.

import type { ModCapabilities } from './manifest.js';

export interface AnalysisResult {
  declaredHooks: string[];
  declaredApiAccess: string[];
  mismatches: string[];
}

/**
 * Analyze a register.ts source string for declared events and API calls.
 * Returns the extracted surface and any mismatches against the declared
 * capabilities.
 */
export function analyzeRegisterSource(source: string, declared: ModCapabilities): AnalysisResult {
  const declaredHooks = new Set<string>();
  const declaredApiAccess = new Set<string>();

  // Find on('event.name', ...) and on("event.name", ...) calls.
  const onRegex = /\bon\(\s*['"]([a-z.]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = onRegex.exec(source)) !== null) {
    const ev = m[1];
    if (ev) declaredHooks.add(ev);
  }

  // Find $.namespace.method( calls.
  const apiRegex = /\$\.\s*([a-zA-Z]+)\.([a-zA-Z]+)/g;
  while ((m = apiRegex.exec(source)) !== null) {
    const ns = m[1];
    const method = m[2];
    if (ns && method) declaredApiAccess.add(`${ns}.${method}`);
  }

  // Check for mismatches.
  const mismatches: string[] = [];
  for (const h of declaredHooks) {
    if (!declared.hooks.includes(h)) {
      mismatches.push(`source registers hook '${h}' but manifest does not declare it`);
    }
  }
  for (const a of declaredApiAccess) {
    if (!declared.apiAccess.includes(a)) {
      mismatches.push(`source uses API '${a}' but manifest does not declare it`);
    }
  }
  // Check network/process usage.
  if (declared.networkAccess === false && /\$\.http\.fetch/.test(source)) {
    mismatches.push('source uses $.http.fetch but manifest declares networkAccess=false');
  }
  if (declared.processExecution === false && /\$\.process\.run/.test(source)) {
    mismatches.push('source uses $.process.run but manifest declares processExecution=false');
  }

  return {
    declaredHooks: Array.from(declaredHooks),
    declaredApiAccess: Array.from(declaredApiAccess),
    mismatches,
  };
}
