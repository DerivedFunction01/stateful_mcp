# Trace Form Engine (`TraceStore`)

The **Trace Form Engine (`TraceStore`)** introduces **procedural execution learning** to the `stateful-mcp` middleware suite. Rather than storing static facts, `TraceStore` stores and executes procedural tool workflows ("Trace Forms") tailored to specific user goals and execution environments.

---

## Key Features

* **Machine-Driven Form Execution**: Step conditions use `@stateful-mcp/core`'s AST translation engine (`get` operation) to evaluate returned tool state dynamically.
* **Deterministic Step Auto-Naming**: Steps are automatically suffixed chronologically (`filter_init_1`, `filter_add_rule_1`, `filter_add_rule_2`) to ensure collision-free step targeting.
* **Autonomous Safety & Approval Gates**: Tools marked `"autonomous": false` pause execution and yield a `resume_token` and prompt for client/human-in-the-loop approval via `trace_resume`.
* **Missing Input Pause**: Execution automatically pauses (`status: "paused"`) with a `resume_token` if required input slots or state handles are missing, allowing the client/LLM to supply them via `trace_resume`.
* **Transactional Compensation Rollbacks**: If a multi-step trace encounters an unhandled runtime error, completed steps are unwound in reverse (LIFO) order using configured rollback actions.
* **Delta Refinements (`trace_refine`)**: LLMs submit targeted delta operations (`replace_step`, `append_step`, `remove_step`, `swap_with_persistent`) rather than regenerating full graph JSON.
* **Paginated Query Engine**: `trace_query` supports paginated search over stored trace forms (`limit`, `offset`, `total`, `has_more`, `next_offset`).

---

## Available MCP Tools

| Tool | Description |
|---|---|
| `trace_query` | Search matching execution traces by intent or goal keywords (supports `limit` & `offset` pagination). |
| `trace_exec` | Execute a trace form end-to-end with LLM-supplied input slot arguments. |
| `trace_resume` | Resume a paused trace following human approval, missing slot supply, or client yield. |
| `trace_inspect` | Inspect the step DAG and metadata of a trace form. |
| `trace_record` | Manage recording sessions (`action="start"` / `"stop"`) or submit pre-constructed trace forms (`action="submit"` directly or via `object_id`). |
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
  "trace_id"?: string,        // Auto-generated on action="start"; required on action="stop"
  "goal"?: string,            // Goal/intent description for the macro
  "input_slots"?: Record<string, {
    "type": "string" | "number" | "boolean" | "object" | "array",
    "description": string,
    "required"?: boolean,
    "default"?: any,
    "target"?: {
      "step_id"?: string,
      "action"?: string,
      "occurrence"?: number, // 1-indexed call number
      "arg_key": string
    }
  }>,
  "capabilities"?: string[],  // Optional for action="stop"
  "object_id"?: string,       // Optional ObjectStore checkpoint ID for action="submit"
  "trace"?: {                 // Required for action="submit" if object_id is omitted
    "trace_id"?: string,
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
  },
  "meta_tools_config": {
    "_type": "file",
    "path": "meta_tools.config.json"
  },
  "pagination_limits": {
    "trace_query_page_size": 10
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

### 2. Non-Recordable Tools Registry (`meta_tools.config.json`)
Meta guidance tools (`*_about`, `*_examples`) and trace control tools (`trace_*`) are excluded from step recording via `DEFAULT_NON_RECORDABLE_SERVICE_TOOLS` (or `meta_tools.config.json`). Operational initialization tools (`state_init`) are recorded as Step 1 of operational macros.

### 3. Argument Parameterization (`$input` & `$step`)
Static values captured during recording are converted into dynamic slots:
- Hardcoded user parameters (e.g. `"P-94820"`, `"cardiology"`) map to `input_slots` (`$input.patient_id`). Explicit `target` locators disambiguate multiple occurrences of identical action parameters.
- Outputs from preceding steps map to `$step.<step_id>.<property>`.
- Step arguments default to hardcoded literal values if explicit `input_slots` are not passed, avoiding slot explosion.
