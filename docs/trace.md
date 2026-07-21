# Trace Form Engine (`TraceStore`)

The **Trace Form Engine (`TraceStore`)** introduces **procedural execution learning** to the `stateful-mcp` middleware suite. Rather than storing static facts, `TraceStore` stores and executes procedural tool workflows ("Trace Forms") tailored to specific user goals and execution environments.

---

## Key Features

* **Machine-Driven Form Execution**: Step conditions use `@stateful-mcp/core`'s AST translation engine (`get` operation) to evaluate returned tool state dynamically.
* **Deterministic Step Auto-Naming**: Steps are automatically suffixed chronologically (`filter_init_1`, `filter_add_rule_1`, `filter_add_rule_2`) to ensure collision-free step targeting.
* **Autonomous Safety & Approval Gates**: Tools marked `"autonomous": false` pause execution and yield a `resume_token` and prompt for client/human-in-the-loop approval via `trace_resume`.
* **Transactional Compensation Rollbacks**: If a multi-step trace encounters an unhandled runtime error, completed steps are unwound in reverse (LIFO) order using configured rollback actions.
* **Delta Refinements (`trace_refine`)**: LLMs submit targeted delta operations (`replace_step`, `append_step`, `remove_step`, `swap_with_persistent`) rather than regenerating full graph JSON.

---

## Available MCP Tools

| Tool | Description |
|---|---|
| `trace_query` | Search matching execution traces by intent or goal keywords. |
| `trace_exec` | Execute a trace form end-to-end with LLM-supplied input slot arguments. |
| `trace_resume` | Resume a paused trace following human approval or client yield. |
| `trace_inspect` | Inspect the step DAG and metadata of a trace form. |
| `trace_record` | Record a newly discovered tool workflow sequence as a trace form. |
| `trace_refine` | Apply targeted delta edits (`replace_step`, `append_step`, `remove_step`, `swap_with_persistent`). |
| `trace_feedback` | Update confidence scores and usage metrics based on execution outcome. |
| `trace_about` | Fetch meta-documentation and guidelines for Trace Forms. |
| `trace_examples` | Fetch example JSON payloads and tool invocation flows. |

---

## Configuration

In `storage.config.json` (or `config.json`):

```json
{
  "version": 1,
  "trace_session_state": { "_type": "adapter", "name": "memory" },
  "trace_persistent_state": {
    "global": { "_type": "adapter", "name": "memory" },
    "user": { "_type": "adapter", "name": "memory" }
  }
}
```

Start the trace service via CLI:
```bash
SERVICE_TYPE=trace stateful-mcp
```
