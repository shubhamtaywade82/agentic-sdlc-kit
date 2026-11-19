"use strict";
/**
 * Scaffold templates for specs, plans, ADRs and the project profile.
 *
 * The spec template SHIPS VALID: it passes `kit validate-spec` unchanged.
 * The plan template intentionally references `./missing-spec.md` so the
 * validator reports SPEC_NOT_FOUND until a real spec is linked.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugToTitle = slugToTitle;
exports.specTemplate = specTemplate;
exports.planTemplate = planTemplate;
exports.adrTemplate = adrTemplate;
function slugToTitle(slug) {
    return slug
        .split(/[-_]+/)
        .filter((p) => p.length > 0)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
}
function specTemplate(slug) {
    const title = slugToTitle(slug);
    const content = `---
kind: spec
mode: feature
status: draft
---

# ${title}

## Problem

Describe the problem this feature solves. State who experiences it, what they
cannot do today, and why solving it matters. Replace this example text with
the concrete situation from the project.

## Scope

### In scope

- The primary behavior or capability this feature delivers
- Documentation updates that describe the new behavior

### Out of scope

- Refactors that are not required for this feature
- Performance tuning beyond the listed acceptance criteria

## Acceptance Criteria

- GIVEN a typical user WHEN they use ${title.toLowerCase()} THEN it completes without errors
- The feature must handle the empty state gracefully
- The new behavior should be covered by automated tests

## Non-functional Requirements

- The affected flow must not regress existing performance characteristics.

## Open Questions

- Which follow-up work depends on this feature?
`;
    return { path: `docs/specifications/features/${slug}.md`, content };
}
function planTemplate(slug) {
    const title = slugToTitle(slug);
    const content = `---
kind: plan
mode: feature
spec: ./missing-spec.md
---

# Plan: ${title}

## Approach

Describe the implementation approach at a high level: the components that
change, the order of work, and the key design decisions. Replace this example
text and link a real specification in the frontmatter.

## Tasks

### TASK-001: Example task

- Depends: none

Acceptance:
- The example outcome is stated in verifiable terms

Verification:
- The example verification command or manual check is listed here

## Checkpoints

- Design review of the approach and task breakdown
- Test review of acceptance criteria and verification steps
`;
    return { path: `docs/plans/${slug}.md`, content };
}
function adrTemplate(slug, number) {
    const num = String(number).padStart(3, "0");
    const title = slugToTitle(slug);
    const content = `---
kind: adr
status: proposed
date: ${new Date().toISOString().slice(0, 10)}
---

# ADR-${num}: ${title}

## Context

Describe the forces at play: technical constraints, project constraints, and
the problem this decision addresses. Keep it factual and neutral.

## Decision

State the decision in one or two plain sentences, then the reasoning.

## Consequences

- What becomes easier because of this decision
- What becomes harder, and what we accept as the cost
`;
    return { path: `docs/architecture/adr/${num}-${slug}.md`, content };
}
