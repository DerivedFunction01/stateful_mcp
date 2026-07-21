# Trace Form Engine Examples

## 1. Querying Traces (Paginated)
```json
{
  "tool": "trace_query",
  "arguments": {
    "intent": "triage patient and filter cardiology department",
    "limit": 10,
    "offset": 0
  }
}
```
**Response**:
```json
{
  "matches": [
    {
      "trace_id": "trc_9a4f21b0",
      "goal": "Triage patient clinical data and filter cardiology department",
      "confidence_score": 0.95,
      "usage_count": 12,
      "input_slots": {
        "patient_id": {
          "type": "string",
          "description": "Patient identifier",
          "required": true,
          "target": { "action": "filter_add_rule", "occurrence": 1, "arg_key": "value" }
        }
      },
      "capabilities": ["Provisions patient session", "Applies cardiology filter"],
      "requires_approval_tools": []
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0,
  "has_more": false
}
```

---

## 2. Interactive Session Recording (Start & Stop)

### Step 1: Start Recording (Backend Auto-Generates `trace_id`)
```json
{
  "tool": "trace_record",
  "arguments": {
    "action": "start",
    "goal": "Triage incoming patient and filter cardiology department",
    "input_slots": {
      "patient_id": {
        "type": "string",
        "description": "Patient identifier",
        "required": true,
        "target": { "action": "filter_add_rule", "occurrence": 1, "arg_key": "value" }
      }
    }
  }
}
```
**Response**:
```json
{
  "status": "recording_started",
  "session_id": "sess_default",
  "trace_id": "trc_9a4f21b0"
}
```

### Step 2: Execute Operational Tools Across Turns
```json
{ "tool": "state_init", "arguments": { "tool_name": "patient_triage" } }
{ "tool": "filter_init", "arguments": { "table": "patients" } }
{ "tool": "filter_add_rule", "arguments": { "field": "id", "op": "eq", "value": "P-94820" } }
```

### Step 3: Stop Recording (Specify `trace_id`)
```json
{
  "tool": "trace_record",
  "arguments": {
    "action": "stop",
    "trace_id": "trc_9a4f21b0",
    "capabilities": ["Provisions patient session", "Applies cardiology filter"]
  }
}
```

---

## 3. Executing a Trace Form
```json
{
  "tool": "trace_exec",
  "arguments": {
    "trace_id": "trc_9a4f21b0",
    "args": {
      "patient_id": "P-94820"
    }
  }
}
```

---

## 4. Submitting a Trace Form via ObjectStore Checkpoint
```json
{
  "tool": "trace_record",
  "arguments": {
    "action": "submit",
    "object_id": "obj_trace_checkpoint_88a"
  }
}
```

---

## 5. Resuming Paused Execution (`trace_resume`)
```json
{
  "tool": "trace_resume",
  "arguments": {
    "resume_token": "resume_1721561000_a89f21",
    "input_args": {
      "patient_id": "P-94820"
    }
  }
}
```

---

## 6. Refining a Trace Form with Delta Operations
```json
{
  "tool": "trace_refine",
  "arguments": {
    "trace_id": "trc_9a4f21b0",
    "action": "append_step",
    "target_step_id": "filter_add_rule_1",
    "new_step": {
      "action": "filter_add_rule",
      "args": { "field": "status", "op": "eq", "value": "active" }
    },
    "reason": "Added active patient status filter constraint"
  }
}
```
