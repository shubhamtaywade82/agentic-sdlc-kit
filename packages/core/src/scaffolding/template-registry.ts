// packages/core/src/scaffolding/template-registry.ts
//
// Template registry. Looks up templates by id and version. M8 ships an
// in-memory registry; M15 adds a filesystem-backed registry that reads
// templates/ from the kit installation.

import { Errors, type Result, type TemplateManifest } from '@agentic-sdlc-kit/contracts';

export interface TemplateRegistry {
  list(): ReadonlyArray<TemplateManifest>;
  lookup(id: string, version?: string): Result<TemplateManifest>;
  register(manifest: TemplateManifest): void;
}

export class InMemoryTemplateRegistry implements TemplateRegistry {
  private templates = new Map<string, TemplateManifest[]>();

  list(): ReadonlyArray<TemplateManifest> {
    return Array.from(this.templates.values()).flat();
  }

  register(manifest: TemplateManifest): void {
    const existing = this.templates.get(manifest.id) ?? [];
    this.templates.set(manifest.id, [...existing, manifest]);
  }

  lookup(id: string, version?: string): Result<TemplateManifest> {
    const list = this.templates.get(id);
    if (!list || list.length === 0) {
      return {
        ok: false,
        error: Errors.contractInvalid(`template not found: ${id}`, { id }),
      };
    }
    if (version) {
      const found = list.find((t) => t.version === version);
      if (!found) {
        return {
          ok: false,
          error: Errors.contractInvalid(`template version not found: ${id}@${version}`, {
            id,
            version,
          }),
        };
      }
      return { ok: true, value: found };
    }
    // No version specified: return the highest semver.
    const sorted = [...list].sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true }),
    );
    const latest = sorted[sorted.length - 1];
    if (!latest) {
      return { ok: false, error: Errors.internal('unreachable: empty list') };
    }
    return { ok: true, value: latest };
  }
}
