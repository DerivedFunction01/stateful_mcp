# Filter Service Worked Example

Here is a worked example demonstrating incremental filter construction:

```
User: Show me active customers who spent more than $100.
LLM: Calling `filter_init(table="customers", session_id="s1")` -> returns "filter_1"
LLM: Calling `filter_add(filter_id="filter_1", condition={field: "status", operator: "equals", value: "active"})` -> returns "filter_2"
LLM: Calling `filter_add(filter_id="filter_2", condition={field: "spend", operator: "greater_than", value: 100})` -> returns "filter_3"
LLM: Calling `filter_inspect(filter_id="filter_3")` -> returns compiled filter
LLM: Calling `filter_execute(filter_id="filter_3")` -> returns data
```
Notice that the LLM builds the filter incrementally, ensuring correctness at each step.
