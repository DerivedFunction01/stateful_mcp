# Dictionary Service Worked Example

```
User: Search for patient notes mentioning a heart attack.
LLM: Calling `dictionary_resolve(term="heart attack", namespace="CLINICAL")` -> returns "CLINICAL::MYOCARDIAL_INFARCTION"
LLM: Calling `filter_init(table="clinical_notes", session_id="s1")` -> returns "filter_1"
LLM: Calling `filter_add(filter_id="filter_1", condition={field: "diagnosis", operator: "equals", value: "CLINICAL::MYOCARDIAL_INFARCTION"})`
```
This demonstrates resolving vernacular to a formal coordinate identifier before query execution.
