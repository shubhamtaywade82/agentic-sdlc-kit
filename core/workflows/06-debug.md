# 06 — Debug

Scientific method, not guess-and-patch. Entry point: `/kit:fix` (bug variant).

1. **Reproduce:** exact steps, input, expected vs actual, full error + stack trace.
2. **Isolate:** smallest failing case; write it as a failing test.
3. **Hypothesize:** list 3 candidate causes ranked by likelihood with evidence.
4. **Test hypotheses** with logs/breakpoints/bisect (`git bisect`), one at a time.
5. **Fix the root cause**, not the symptom. Minimal change.
6. **Prove it:** regression test passes; `node .ai/kit/bin/kit.js verify` green.
7. **Document:** cause, fix, and how to prevent (in PR / postmortem).

Anti-patterns: wrapping in try/catch to hide it, adding sleeps, "fixing" the test instead of the code.

Prompt: `prompts/06-debug.md`
