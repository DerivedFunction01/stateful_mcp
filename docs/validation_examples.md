# Validation Engine Examples

The `validation_engine` parameter in `tools.config.json` points to an external JSON Schema or Ajv configuration file to enforce advanced logic constraints on public filter inputs before they hit database compilation.

---

## Example 1: Drug Dosage Threshold Restrictions (JSON Schema)
This validation file enforces that when querying pharmacy databases for controlled narcotics, the dosage or quantity filtered must not exceed strict medical limits.

### Configuration (`config/tools.config.json`)
```json
{
  "tools": {
    "dispense_medication": {
      "schema": { "_type": "file", "path": "schemas/dispense.json" },
      "validation_engine": { "_type": "file", "path": "validators/dispense_rules.json" },
      "engine": { "_type": "adapter", "name": "postgres", "options": { "url": "env:DATABASE_URL" } }
    }
  }
}
```

### Validator File (`validators/dispense_rules.json`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Narcotics Dosage Guard",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "property": { "type": "string" },
      "operator": { "type": "string" },
      "value": { "type": "any" }
    },
    "allOf": [
      {
        "if": {
          "properties": {
            "property": { "const": "qty" },
            "operator": { "enum": ["eq", "gt", "geq"] }
          }
        },
        "then": {
          "properties": {
            "value": {
              "type": "number",
              "maximum": 120,
              "description": "Controlled narcotics dispense limit exceeded (Max: 120 units)"
            }
          }
        }
      }
    ]
  }
}
```

---

## Example 2: Allowed Date Range Constraints (JSON Schema)
Enforces constraints ensuring start/end date ranges in transaction history queries are within a maximum period (e.g., no queries spanning more than 90 days).

### Validator File (`validators/date_range_rules.json`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "90-Day Transaction Query Guard",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "property": { "type": "string" },
      "operator": { "type": "string" },
      "value": { "type": "any" }
    },
    "allOf": [
      {
        "if": {
          "properties": {
            "property": { "const": "transaction_date" },
            "operator": { "const": "between" }
          }
        },
        "then": {
          "properties": {
            "value": {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "items": { "type": "string", "format": "date-time" }
            }
          }
        }
      }
    ]
  }
}
```

---

## Example 3: External API Validator (Remote Schema URL)
If the validation schema is hosted remotely (e.g., an internal hospital compliance API), the system fetches it dynamically using a `remote_url` locator.

### Configuration (`config/tools.config.json`)
```json
{
  "tools": {
    "dispense_medication": {
      "schema": { "_type": "file", "path": "schemas/dispense.json" },
      "validation_engine": {
        "_type": "remote_url",
        "url": "https://compliance.hospital.org/api/v1/narcotics-schema",
        "headers": { "Authorization": "Bearer env:API_TOKEN" }
      },
      "engine": { "_type": "adapter", "name": "postgres", "options": { "url": "env:DATABASE_URL" } }
    }
  }
}
```

### Request & Response Payloads
When the filter is initialized or modified, the middleware sends a POST request to the `url` endpoint with the following payload structure:

#### POST Request Body
```json
{
  "toolName": "dispense_medication",
  "tableName": "prescriptions",
  "rules": [
    {
      "property": "qty",
      "operator": "gt",
      "value": 150
    }
  ]
}
```

#### Expected JSON Response (Success)
```json
{
  "valid": true
}
```

#### Expected JSON Response (Validation Failure)
```json
{
  "valid": false,
  "errors": [
    "Controlled narcotics dispense limit exceeded (Max: 120 units)"
  ]
}
```

---

## Example 4: Custom Validation Script Execution (Custom Adapter)
For complex validation logic (e.g., verifying a patient's active status via a Python script), register a custom validation adapter factory that executes a script subprocess:

### Configuration (`config/tools.config.json`)
```json
{
  "tools": {
    "dispense_medication": {
      "schema": { "_type": "file", "path": "schemas/dispense.json" },
      "validation_engine": {
        "_type": "adapter",
        "name": "script_validator",
        "options": {
          "script_path": "scripts/validate_narcotic_limits.py",
          "python_path": "python3"
        }
      },
      "engine": { "_type": "adapter", "name": "postgres", "options": { "url": "env:DATABASE_URL" } }
    }
  }
}
```

### Script Validator Factory Registration (`src/adapters/validators/script-validator.ts`)
```typescript
import { registerAdapter } from "../../config/loader";
import { spawnSync } from "child_process";

registerAdapter("script_validator", {
  create: async (options) => {
    return {
      validate: async (rules: any[]) => {
        const script = String(options.script_path);
        const py = String(options.python_path || "python3");

        // Spawn validator script and pass rules as JSON stdin
        const proc = spawnSync(py, [script], { input: JSON.stringify(rules), encoding: "utf-8" });
        if (proc.status !== 0) {
          throw new Error(`Validation rejected: ${proc.stderr.trim()}`);
        }
        return JSON.parse(proc.stdout); // Expected: { valid: true } or { valid: false, errors: [...] }
      }
    };
  }
});
```

