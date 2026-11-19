// packages/core/src/learning/hypothesis-engine.ts
//
// M31 Improvement Hypothesis Engine: translates recurring patterns and
// distilled memories into actionable, testable Skill improvement proposals.
//
// The output depends on the input memory's domain and content. Different
// memory categories produce different hypotheses with targeted skills,
// changes, and benchmark tasks.

import type { MemoryEntry, SkillImprovementHypothesis } from '@agentic-sdlc-kit/contracts';

interface HypothesisTemplate {
  targetSkill: string;
  proposedChange: string;
  expectedBenefit: string;
  riskLevel: 'low' | 'medium' | 'high';
  benchmarkTasks: string[];
}

/**
 * Map memory domain/category to a hypothesis template. The template is
 * derived from the memory's content rather than being a constant.
 */
function deriveTemplate(mem: MemoryEntry): HypothesisTemplate | null {
  const domain = mem.domain;
  const content = mem.content.toLowerCase();
  const summary = mem.summary.toLowerCase();

  // Detect failure patterns from content.
  if (
    content.includes('verification') ||
    content.includes('regression') ||
    summary.includes('fail')
  ) {
    return {
      targetSkill: 'tdd-bdd',
      proposedChange: `Add explicit verification-boundary analysis before the TDD loop for ${domain} tasks. The memory identifies recurring verification failures in this domain.`,
      expectedBenefit: `Reduce regression rate in ${domain} tasks by catching integration boundary issues before implementation.`,
      riskLevel: 'low',
      benchmarkTasks: [`FEATURE-${domain.toUpperCase()}-SLICE`, 'FEATURE-API-GATE'],
    };
  }

  if (
    content.includes('architecture') ||
    content.includes('coupling') ||
    summary.includes('design')
  ) {
    return {
      targetSkill: 'system-design',
      proposedChange: `Strengthen the architecture-analysis phase for ${domain} to require coupling assessment before proposing new abstractions.`,
      expectedBenefit: `Reduce over-engineering in ${domain} by requiring evidence of coupling pressure before introducing patterns.`,
      riskLevel: 'medium',
      benchmarkTasks: [`FEATURE-${domain.toUpperCase()}-ARCH`],
    };
  }

  if (content.includes('security') || content.includes('auth') || summary.includes('secret')) {
    return {
      targetSkill: 'security-engineering',
      proposedChange: `Add mandatory security review checkpoint for ${domain} changes that touch authentication or secret handling.`,
      expectedBenefit: `Prevent security regressions in ${domain} by requiring independent security review.`,
      riskLevel: 'high',
      benchmarkTasks: [`SECURITY-${domain.toUpperCase()}-CHECK`],
    };
  }

  if (content.includes('test') || content.includes('coverage') || summary.includes('characteriz')) {
    return {
      targetSkill: 'tdd-bdd',
      proposedChange: `Require characterization tests before any structural change in ${domain} modules.`,
      expectedBenefit: `Preserve observable behavior during ${domain} refactoring by establishing baselines first.`,
      riskLevel: 'low',
      benchmarkTasks: [`REFACTOR-${domain.toUpperCase()}-BASELINE`],
    };
  }

  // Default: generic improvement derived from the memory's domain.
  return {
    targetSkill: 'code-quality',
    proposedChange: `Review ${domain} engineering guidance based on accumulated experience: ${mem.summary}`,
    expectedBenefit: `Improve ${domain} task completion by incorporating learned patterns into the skill.`,
    riskLevel: 'low',
    benchmarkTasks: [`FEATURE-${domain.toUpperCase()}-GENERIC`],
  };
}

export class HypothesisEngine {
  generateFromMemories(memories: readonly MemoryEntry[]): SkillImprovementHypothesis[] {
    const hypotheses: SkillImprovementHypothesis[] = [];

    for (const mem of memories) {
      // Only generate hypotheses for memories with sufficient confidence.
      if (mem.confidence < 0.7) continue;

      const template = deriveTemplate(mem);
      if (!template) continue;

      hypotheses.push({
        id: `HYP-${Date.now()}-${hypotheses.length + 1}`,
        targetSkill: template.targetSkill,
        problemObserved: mem.summary,
        proposedChange: template.proposedChange,
        expectedBenefit: template.expectedBenefit,
        riskLevel: template.riskLevel,
        benchmarkTasks: template.benchmarkTasks,
      });
    }

    return hypotheses;
  }
}
