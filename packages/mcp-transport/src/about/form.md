# Form Service: Strategy & Guidelines

The Form Service manages dynamically branched questionnaires and survey forms. It operates as a stateful graph engine where next questions are resolved dynamically on-the-fly based on prior answers and skip actions.

## Rules of Engagement
* **Incremental Answering**: Call `form_answer` or `form_skip` after each response. The returned `next_questions` list will tell you which question(s) are now active and need to be asked.
* **Back-Navigation**: If the user wants to revise a previous choice, call `form_back` with the target question. The engine preserves subsequent answers where possible but flags them as `stale` if the branching path shifts.
* **Skipping Optional Fields**: Non-required questions can be explicitly bypassed using `form_skip`.
* **Resolve Final State**: Once the form indicates `complete: true`, call `form_resolve` to consolidate all active answers, automatically filtering out any stale answers from inactive branching paths.
