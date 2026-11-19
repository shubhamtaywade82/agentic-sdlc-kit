# Prompt: Clarify → PRD

I want to build: <IDEA>
Users: <WHO>   Constraints: <DEADLINE, STACK, BUDGET>

Act as a product-minded senior engineer.
1. Ask me up to 5 clarifying questions covering: target user & problem, scope boundaries,
   edge cases, non-goals, and how we measure success. Wait for answers.
2. Then write docs/product/<slug>.md using templates/PRD.md.
   - Acceptance criteria in Given/When/Then, each independently testable.
   - Explicit "Out of scope" list.
   - Open questions at the end.
Do not write any code.
