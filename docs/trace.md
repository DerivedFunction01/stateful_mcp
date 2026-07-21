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
| `trace_record` | Manage recording sessions (`action="start"` / `"stop"`) or submit pre-constructed trace forms (`action="submit"`). |
| `trace_refine` | Apply targeted delta edits (`replace_step`, `append_step`, `remove_step`, `swap_with_persistent`). |
| `trace_feedback` | Update confidence scores and usage metrics based on execution outcome. |
| `trace_about` | Fetch meta-documentation and guidelines for Trace Forms. |
| `trace_examples` | Fetch example JSON payloads and tool invocation flows. |

---

## High-Level Schemas

### `trace_record` Schema
```typescript
{
  "action": "start" | "stop" | "submit",
  "trace_id"?: string,        // Required for action="start"
  "goal"?: string,            // Required for action="start"
  "input_slots"?: Record<string, {
    "type": "string" | "number" | "boolean" | "object" | "array",
    "description": string,
    "required"?: boolean,
    "default"?: any
  }>,
  "capabilities"?: string[],  // Optional for action="stop"
  "trace"?: {                 // Required for action="submit"
    "trace_id": string,
    "goal": string,
    "input_slots"?: Record<string, TraceSlot>,
    "capabilities"?: string[],
    "steps": Array<{
      "action": string,
      "id"?: string,
      "args"?: Record<string, any>,
      "conditions"?: Array<{
        "pipeline": Array<{ op: string, args: any[], return_var?: string }>,
        "target": string
      }>,
      "default_target"?: string | null
    }>
  }
}
```

### `trace_refine` Schema
```typescript
{
  "trace_id": string,
  "action": "swap_with_persistent" | "replace_step" | "append_step" | "remove_step",
  "step_id"?: string,          // Target step ID (for replace_step, remove_step, swap_with_persistent)
  "target_step_id"?: string,   // Target step ID after which to append (for append_step)
  "new_step"?: TraceStep,      // New step definition (for replace_step and append_step)
  "persistent_key"?: string,   // Persistent key (for swap_with_persistent)
  "reason"?: string            // Optional refinement note
}
```

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

---

## Trace Capture & Recording Architecture

Recording a new procedural trace form into `TraceStore` (`trace_record`) works across two deployment models:

### 1. In-Process Event Interception (Stateful Middleware Tools)
For tools within the `@stateful-mcp/core` suite (`filter_*`, `object_*`, `form_*`):
- Stores publish state mutation events via `CoreEventBroker` (`eventBroker.emitStateChange(...)`).
- `TraceStore` listens to session events, automatically building step DAG nodes with auto-incrementing suffixes (`filter_init_1`, `filter_add_rule_1`), output parameter bindings, and AST condition rules.

### 2. Host Agent Trajectory Recording (External Third-Party MCP Tools)
Because independent MCP servers run in isolated processes (over stdio/HTTP/SSE), one MCP server cannot inspect traffic sent to another external MCP server.
- The **LLM Client / Agent Host** (e.g. Cursor, Antigravity, Devin, LangChain) logs tool execution trajectories `(tool_name, arguments, response)`.
- Upon workflow completion, the host agent invokes `trace_record` passing the structured `TraceForm` graph.

### 3. Argument Parameterization (`$input` & `$step`)
Static values captured during recording are converted into dynamic slots:
- Hardcoded user parameters (e.g. `"P-94820"`, `"cardiology"`) map to `input_slots` (`$input.patient_id`).
- Outputs from preceding steps map to `$step.<step_id>.<property>`.

