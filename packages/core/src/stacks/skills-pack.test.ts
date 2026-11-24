import { describe, expect, it } from 'vitest';
import {
  NODE_SKILLS_PACK,
  REACT_SKILLS_PACK,
  RUBY_SKILLS_PACK,
  WORKFLOW_STAGES,
  defaultSkillsPackForStack,
  listSkillsPacks,
  recommendSkillsByStage,
  recommendSkillsForStage,
  resolveSkillsPack,
  skillsPacksForStack,
} from './skills-pack.js';

const isKebab = (s: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(s);

describe('Skills Packs registry', () => {
  it('resolves each external pack by id', () => {
    expect(resolveSkillsPack('ruby-agent-skills')).toBe(RUBY_SKILLS_PACK);
    expect(resolveSkillsPack('node-agent-skills')).toBe(NODE_SKILLS_PACK);
    expect(resolveSkillsPack('react-agent-skills')).toBe(REACT_SKILLS_PACK);
    expect(resolveSkillsPack('nope')).toBeUndefined();
  });

  it('lists exactly the three published packs', () => {
    expect(listSkillsPacks().map((p) => p.id)).toEqual([
      'ruby-agent-skills',
      'node-agent-skills',
      'react-agent-skills',
    ]);
  });

  it('declares measured skill counts and a skills directory', () => {
    expect(RUBY_SKILLS_PACK.skillCount).toBe(104);
    expect(NODE_SKILLS_PACK.skillCount).toBe(322);
    expect(REACT_SKILLS_PACK.skillCount).toBe(129);
    for (const pack of listSkillsPacks()) {
      expect(pack.skillsPath).toBe('skills');
      expect(pack.repository).toMatch(/^[^/]+\/[^/]+$/);
      expect(pack.url.startsWith('https://github.com/')).toBe(true);
    }
  });

  it('maps kit stack ids to their language pack', () => {
    expect(skillsPacksForStack('node-typescript')).toEqual([NODE_SKILLS_PACK]);
    expect(skillsPacksForStack('react-typescript')).toEqual([REACT_SKILLS_PACK]);
    expect(skillsPacksForStack('ruby-rails')).toEqual([RUBY_SKILLS_PACK]);
    expect(skillsPacksForStack('ruby')).toEqual([RUBY_SKILLS_PACK]);
    expect(defaultSkillsPackForStack('python')).toBeUndefined();
    expect(defaultSkillsPackForStack('go')).toBeUndefined();
    expect(defaultSkillsPackForStack('')).toBeUndefined();
  });

  it('covers every workflow stage for every mapped stack with valid skills', () => {
    const stacks = ['node-typescript', 'react-typescript', 'ruby-rails', 'ruby'];
    expect(WORKFLOW_STAGES.length).toBe(9);
    for (const stack of stacks) {
      for (const stage of WORKFLOW_STAGES) {
        const skills = recommendSkillsForStage(stack, stage);
        expect(skills.length, `${stack}/${stage}`).toBeGreaterThan(0);
        for (const skill of skills) {
          expect(isKebab(skill), `${stack}/${stage}/${skill}`).toBe(true);
        }
        expect(new Set(skills).size).toBe(skills.length);
      }
    }
  });

  it('returns empty recommendations for unknown stacks and stages', () => {
    expect(recommendSkillsForStage('python', 'tdd')).toEqual([]);
    expect(recommendSkillsForStage('go', 'release')).toEqual([]);
    expect(recommendSkillsForStage('node-typescript', 'nonexistent' as never)).toEqual([]);
    const byStage = recommendSkillsByStage('python');
    for (const stage of WORKFLOW_STAGES) {
      expect(byStage[stage]).toEqual([]);
    }
  });

  it('maps the kit TDD loop onto pack TDD and review skills', () => {
    expect(recommendSkillsForStage('ruby-rails', 'tdd')).toContain('ruby-tdd-refactoring');
    expect(recommendSkillsForStage('node-typescript', 'tdd')).toContain('node-testing');
    expect(recommendSkillsForStage('react-typescript', 'tdd')).toContain(
      'react-testing-engineering',
    );
    expect(recommendSkillsForStage('node-typescript', 'review')).toContain('node-code-review');
    expect(recommendSkillsForStage('ruby-rails', 'release')).toContain('rails-release-engineering');
  });
});
