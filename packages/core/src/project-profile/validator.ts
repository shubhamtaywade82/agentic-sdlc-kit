// packages/core/src/project-profile/validator.ts
//
// Validates a ProjectProfile against the zod schema. Returns a Result with
// a structured PROFILE_INVALID error on failure; never throws.

import {
  Errors,
  ProjectProfileSchema,
  type ProjectProfile,
  type Result,
} from '@agentic-sdlc-kit/contracts';

export function validateProfile(input: unknown): Result<ProjectProfile> {
  const parsed = ProjectProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: Errors.profileInvalid('ProjectProfile failed schema validation', {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      }),
    };
  }
  return { ok: true, value: parsed.data };
}
