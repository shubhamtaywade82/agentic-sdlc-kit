// packages/core/src/elicitation/engine.ts
//
// Pure elicitation state: which questions apply, which are answered, and
// whether the gate for advancing the spec is open. Persistence lives in the CLI.

import type { Question, QuestionStack } from './question-bank.js';

export type AnswerSource = 'user' | 'assumption';

export interface Answer {
  questionId: string;
  value: string;
  source: AnswerSource;
  answeredAt: string;
}

export interface ElicitationRecord {
  schemaVersion: 1;
  featureId: string;
  answers: Answer[];
}

export type ElicitationError =
  | { kind: 'unknown-question'; questionId: string }
  | { kind: 'invalid-option'; questionId: string; allowed: readonly string[] }
  | { kind: 'empty-answer'; questionId: string }
  | { kind: 'assumption-not-allowed'; questionId: string };

export function applicableQuestions(
  bank: readonly Question[],
  stacks: readonly QuestionStack[],
): Question[] {
  return bank.filter((q) => q.stacks === undefined || q.stacks.some((s) => stacks.includes(s)));
}

export function emptyRecord(featureId: string): ElicitationRecord {
  return { schemaVersion: 1, featureId, answers: [] };
}

/** Validates an answer against the question and returns the new record. */
export function recordAnswer(
  record: ElicitationRecord,
  bank: readonly Question[],
  questionId: string,
  value: string,
  source: AnswerSource,
  now: Date,
): { ok: true; record: ElicitationRecord } | { ok: false; error: ElicitationError } {
  const question = bank.find((q) => q.id === questionId);
  if (question === undefined) return { ok: false, error: { kind: 'unknown-question', questionId } };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: false, error: { kind: 'empty-answer', questionId } };
  if (question.options.length > 0 && !question.options.includes(trimmed)) {
    return { ok: false, error: { kind: 'invalid-option', questionId, allowed: question.options } };
  }
  if (source === 'assumption' && question.blocking) {
    return { ok: false, error: { kind: 'assumption-not-allowed', questionId } };
  }
  const answer: Answer = { questionId, value: trimmed, source, answeredAt: now.toISOString() };
  const answers = record.answers.filter((a) => a.questionId !== questionId).concat(answer);
  return { ok: true, record: { ...record, answers } };
}

/** Applicable questions with no answer yet, blocking ones first. */
export function unanswered(
  applicable: readonly Question[],
  record: ElicitationRecord,
): Question[] {
  const answered = new Set(record.answers.map((a) => a.questionId));
  return applicable
    .filter((q) => !answered.has(q.id))
    .sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

/** The gate: open only when every applicable blocking question has a user answer. */
export function gateStatus(
  applicable: readonly Question[],
  record: ElicitationRecord,
): { open: boolean; missingBlocking: string[] } {
  const userAnswered = new Set(record.answers.filter((a) => a.source === 'user').map((a) => a.questionId));
  const missingBlocking = applicable
    .filter((q) => q.blocking && !userAnswered.has(q.id))
    .map((q) => q.id);
  return { open: missingBlocking.length === 0, missingBlocking };
}
