// plugins/model-router/tests/signals.test.ts
//
// Deterministic text signals for routing a subagent spawn. Only positive
// evidence changes the baseline; anything unrecognised returns null so the
// router keeps its explicit baseline instead of guessing.
import { describe, expect, it } from 'vitest';
import { classifyText } from '../policies/signals';
import { classifyComplexity, classifyRisk } from '../policies/classifier';

const verdict = (text: string) => {
  const found = classifyText(text);
  return found === null
    ? null
    : { complexity: classifyComplexity(found.input), risk: classifyRisk(found.input), found };
};

describe('classifyText', () => {
  it.each([
    ['fix a typo in the README', 'low', 'low'],
    ['rename a variable and format the file', 'low', 'low'],
    ['update the changelog', 'low', 'low'],
  ])('low-signal task is low/low: %s', (text, complexity, risk) => {
    expect(verdict(text)).toMatchObject({ complexity, risk });
  });

  it.each([
    ['drop the users table in production', 'critical'],
    ['force-push to main and deploy to prod', 'critical'],
    ['delete the old build artifacts', 'high'],
    ['rotate the oauth credentials and update auth', 'high'],
    ['deploy the release', 'medium'],
  ])('risk signals: %s -> risk %s', (text, risk) => {
    expect(verdict(text)?.risk).toBe(risk);
  });

  it('a security-sensitive task is at least medium complexity', () => {
    expect(verdict('review the jwt verification')?.complexity).not.toBe('low');
  });

  it.each([
    'redesign the architecture of the order service',
    'rewrite the whole persistence layer across modules',
  ])('architecture-scale wording is high complexity: %s', (text) => {
    expect(verdict(text)?.complexity).toBe('high');
  });

  it('a low keyword never wins over a contrary signal', () => {
    // "docs" is low, but "production" + "drop" must dominate.
    expect(verdict('update docs then drop the production schema')?.risk).toBe('critical');
    expect(verdict('fix a typo in the auth token handling')?.complexity).not.toBe('low');
  });

  it('a long description is never classified low even with a low keyword', () => {
    const long = 'fix a typo ' + 'and also consider many other things '.repeat(12);
    expect(verdict(long)?.complexity).not.toBe('low');
  });

  it('returns null when nothing is recognised (unknown stays explicit)', () => {
    expect(classifyText('')).toBeNull();
    expect(classifyText('code-reviewer')).toBeNull();
    expect(classifyText('look into the thing')).toBeNull();
  });

  it('reports the evidence it used, and matches whole words only', () => {
    const found = classifyText('drop the staging table')!;
    expect(found.evidence.join(' ')).toMatch(/drop/);
    expect(classifyText('the dropdown menu')).toBeNull(); // not "drop"
    expect(classifyText('a production-ready summary')).not.toBeNull(); // "production" is a word
  });
});
