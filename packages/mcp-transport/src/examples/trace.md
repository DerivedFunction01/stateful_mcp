# Trace Form Engine Examples

## 1. Querying Traces
```json
{
  "tool": "trace_query",
  "arguments": {
    "intent": "triage patient and filter cardiology department",
    "limit": 3
  }
}
```

## 2. Executing a Trace Form
```json
{
  "tool": "trace_exec",
  "arguments": {
    "trace_id": "patient_intake_triage_v1",
    "args": {
      "patient_id": "P-94820",
      "symptom": "shortness of breath"
    }
  }
}
```

## 3. Interactive Session Recording (Start & Stop)
```json
{
  "tool": "trace_record",
  "arguments": {
    "action": "start",
    "trace_id": "patient_intake_triage_v1",
    "goal": "Triage incoming patient and filter cardiology department",
    "input_slots": {
      "patient_id": { "type": "string", "description": "Patient identifier", "required": true }
    }
  }
}
```

```json
{
  "tool": "trace_record",
  "arguments": {
    "action": "stop",
    "capabilities": ["Provisions patient session", "Applies cardiology filter"]
  }
}
```

## 4. Submitting a Pre-Constructed Trace Form
```json
{
  "tool": "trace_record",
  "arguments": {
    "action": "submit",
    "trace": {
      "trace_id": "patient_intake_triage_v1",
      "goal": "Triage incoming patient and filter cardiology department",
      "input_slots": {
        "patient_id": { "type": "string", "description": "Patient identifier", "required": true }
      },
      "steps": [
        { "action": "filter_init" },
        { "action": "filter_add_rule", "args": { "field": "dept", "op": "eq", "value": "cardiology" } }
      ]
    }
  }
}
```

## 4. Refining a Trace Form with Delta Operations
```json
{
  "tool": "trace_refine",
  "arguments": {
    "trace_id": "patient_intake_triage_v1",
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
