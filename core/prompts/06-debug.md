# Prompt: Debug

Bug: <WHAT HAPPENS>   Expected: <WHAT SHOULD>
Repro steps: <STEPS>   Error/stack trace:
```
<PASTE>
```
Environment: <versions, OS, branch/commit>

Do NOT patch yet.
1. Restate the bug and write a failing test that reproduces it. Run it.
2. List 3 hypotheses ranked by likelihood, with evidence from the code.
3. Test each hypothesis (logs, reading code, bisect) and report findings.
4. Fix the root cause with a minimal change. Show the test passing and the full suite green.
5. Explain the cause in 2 sentences and how to prevent recurrence.
