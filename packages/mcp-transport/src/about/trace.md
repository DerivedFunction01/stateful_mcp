# Trace Form Engine (`TraceStore`)

The **Trace Form Engine (`TraceStore`)** introduces **procedural execution learning** to the stateful middleware suite. While standard memory stores static facts, `TraceStore` records and executes procedural macro workflows.

---

## 1. High-Level Schemas

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
  "checkpoint_id"?: string,   // Optional ObjectStore checkpoint ID for action="submit" (object_id supported as alias)
  "object_id"?: string,       // Alias for checkpoint_id
  "trace"?: {                 // Required for action="submit" if checkpoint_id is omitted
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
  "action"?: "swap_with_persistent" | "replace_step" | "append_step" | "remove_step" | "promote_arg" | "demote_arg", // Optional if checkpoint_id is provided
  "checkpoint_id"?: string,   // Optional ObjectStore checkpoint ID containing DeltaOperation (object_id supported as alias)
  "object_id"?: string,       // Alias for checkpoint_id
  "delta"?: DeltaOperation,   // Optional inline DeltaOperation object
  "step_id"?: string,          // Required for replace_step, remove_step, swap_with_persistent, promote_arg, demote_arg
  "target_step_id"?: string,   // Target step ID after which to append (for append_step)
  "new_step"?: TraceStep,      // Required for replace_step and append_step
  "persistent_key"?: string,   // Required for swap_with_persistent
  "arg_key"?: string,          // Target step argument key (for promote_arg and demote_arg)
  "slot_name"?: string,        // Input slot name (for promote_arg and demote_arg)
  "literal_value"?: any,       // Static literal value (for demote_arg)
  "slot_def"?: TraceSlot,      // Input slot definition schema (for promote_arg)
  "reason"?: string            // Audit note explaining the refinement
}
```

---

## 2. Key Execution Mechanics
- **Session Recording (`action="start"` / `"stop"`)**: Start recording before calling stateful tools across turns. `TraceStore` automatically tracks executed tools, parameter bindings, and auto-suffixes step IDs (`filter_init_1`, `filter_add_rule_1`).
- **AST Conditions**: Step condition evaluation uses `@stateful-mcp/core`'s AST `get` pipeline.
- **Safety Policy Inheritance**: Non-autonomous tools (`autonomous: false` in `tools.config.json`) automatically pause execution for approval (`trace_resume`).

---

## 3. Rules of Engagement & Best Practices

* **Search Existing Traces First**: Before building a workflow from scratch, call `trace_query` to check if a pre-constructed trace macro already matches the goal.
* **Reuse & Execute**: Execute verified workflows using `trace_exec` with LLM-supplied input slot arguments rather than executing individual tool calls manually.
* **Handle Paused Execution**: If `trace_exec` returns `status: "paused"`, yield the `resume_token` and prompt for client/human approval or missing slot parameters before calling `trace_resume`.
* **Delta Refinements**: When modifying an existing trace, submit targeted delta operations via `trace_refine` (`replace_step`, `append_step`, `remove_step`, `promote_arg`) instead of regenerating the entire step graph.

