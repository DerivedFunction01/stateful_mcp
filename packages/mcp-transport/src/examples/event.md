# Event Service Worked Example

```
User: Merge stream A and B.
LLM: Calling `event_merge(session_id="s1", source_ids_or_aliases=["stream_a", "stream_b"], target_id_or_alias="main")` -> returns status: "conflict", merge_session_id: "merge_123"
LLM: Calling `event_merge_inspect(merge_session_id="merge_123")` -> returns conflicting event ID: "ev_1"
LLM: Calling `event_merge_resolve(merge_session_id="merge_123", event_id="ev_1", resolution={strategy: "accept_source", source_id: "stream_b"})` -> returns new merge session ID: "merge_124"
LLM: Calling `event_merge_commit(merge_session_id="merge_124", session_id="s1")` -> returns committed ID "main"
```
This shows the step-by-step resolution of conflicts before merge completion.
