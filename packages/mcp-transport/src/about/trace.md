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
  "step_id"?: string,          // Required for replace_step, remove_step, swap_with_persistent
  "target_step_id"?: string,   // Target step ID after which to append (for append_step)
  "new_step"?: TraceStep,      // Required for replace_step and append_step
  "persistent_key"?: string,   // Required for swap_with_persistent
  "reason"?: string            // Audit note explaining the refinement
}
```

---

## 2. Key Execution Mechanics
- **Session Recording (`action="start"` / `"stop"`)**: Start recording before calling stateful tools across turns. `TraceStore` automatically tracks executed tools, parameter bindings, and auto-suffixes step IDs (`filter_init_1`, `filter_add_rule_1`).
- **AST Conditions**: Step condition evaluation uses `@stateful-mcp/core`'s AST `get` pipeline.
- **Safety Policy Inheritance**: Non-autonomous tools (`autonomous: false` in `tools.config.json`) automatically pause execution for approval (`trace_resume`).

---

## 3. Developer Integration & Auto-Recording Mechanics

When building a new stateful service (e.g. `notification_service`), developers do **NOT** manually call `traceStore.recordStep()` inside every tool handler:

1. **Automatic Event Interception**: Standard stateful tool handlers emit state mutation events via `eventBroker.emit("state:changed", { service, action, sessionId, data })`.
2. **Zero-Boilerplate Auto-Recording**: `TraceStore` listens to `CoreEventBroker` globally. When an active session is recording, `TraceStore` automatically captures and formats executed steps.
3. **Filtering Meta-Tools**: `TraceStore` checks `isRecordableTool(action)`. Meta guidance (`*_about`, `*_examples`) and trace management tools (`trace_*`) are excluded automatically via `DEFAULT_NON_RECORDABLE_SERVICE_TOOLS` (or `meta_tools.config.json`).

