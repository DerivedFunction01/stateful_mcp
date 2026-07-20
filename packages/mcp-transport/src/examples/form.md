# Form Service Worked Example

```
User: Let's start the patient intake form.
LLM: Calling `form_init(schema_name="patient_intake", session_id="s1")` -> returns "form_1" (next questions: ["q_name"])
LLM: What is your full name?
User: John Doe
LLM: Calling `form_answer(form_id="form_1", question_id="q_name", value="John Doe", session_id="s1")` -> returns "form_2" (next questions: ["q_age"])
LLM: What is your age?
User: 30
LLM: Calling `form_answer(form_id="form_2", question_id="q_age", value=30, session_id="s1")` -> returns "form_3" (next questions: ["q_smoke"])
LLM: Do you currently smoke?
User: Yes
LLM: Calling `form_answer(form_id="form_3", question_id="q_smoke", value=true, session_id="s1")` -> returns "form_4" (next questions: ["q_smoke_frequency"])
LLM: How many cigarettes per day do you smoke?
User: 5
LLM: Calling `form_answer(form_id="form_4", question_id="q_smoke_frequency", value=5, session_id="s1")` -> returns "form_5" (next questions: ["q_alcohol"])
LLM: Describe your alcohol usage (optional).
User: None, please skip.
LLM: Calling `form_skip(form_id="form_5", question_id="q_alcohol", session_id="s1")` -> returns "form_6" (complete: true)
LLM: Calling `form_resolve(form_id="form_6", session_id="s1")` -> returns fully compiled form answers
```
This shows linear answering, branching based on `q_smoke === true`, optional question skipping, and resolution.
