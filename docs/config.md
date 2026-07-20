# Configuration Specification

This document details how to configure the stateful MCP middleware suite. The configuration can be defined in a single file (`filter.config.json`) or split into three files under `config/`: `tools.config.json` (tool schemas and engines — a developer concern), `storage.config.json` (storage backends — an operations concern), and `about.config.json` (documentation/example resources — a separate concern that changes at a different cadence from both).

---

## 1. Resource Locator (`ResourceLocator`)

Every state, schema, or configuration file reference in the middleware is specified using a `ResourceLocator` object.

### Fields
* **`_type`** (string, required): The locator type. Must be `"adapter"`, `"file"`, or `"remote_url"`.
* **`name`** (string): The registration name of the storage adapter (required when `_type === "adapter"`). Examples: `"memory"`, `"sqlite"`, `"postgres"`.
* **`options`** (object): Adapter-specific option parameters (e.g. database URLs).
* **`path`** (string): Absolute or relative filesystem path to a file (required when `_type === "file"`).
* **`url`** (string): Remote HTTP URL (required when `_type === "remote_url"`). Supports `{userId}` substitutions.
* **`ttl_ms`** (number): Time-to-live caching interval in milliseconds.
* **`headers`** (object): HTTP headers to supply during fetch operations (when `_type === "remote_url"`).

#### Examples
```json
{
  "_type": "file",
  "path": "config/about/middleware.md"
}
```

```json
{
  "_type": "remote_url",
  "url": "https://api.firm.internal/ontology/concepts",
  "ttl_ms": 3600000,
  "headers": {
    "Authorization": "Bearer token123"
  }
}
```

---

## 2. Storage & Session Configuration (`storage.config.json`)

Controls backends for VCS DAG chains, dictionaries, and compression thresholds.

### Parameters
* **`version`** (integer, required): Must be `1`.
* **`filter_session_state`**: Session storage for filters (must resolve to a `SessionFilterStore` adapter).
* **`filter_persistent_state`**: Persistent storage for whitelisted filters. Contains `{ global: ResourceLocator, user: ResourceLocator }`.
* **`object_session_state`**: Session storage for objects.
* **`object_persistent_state`**: Persistent storage for objects. Contains `{ global: ResourceLocator, user: ResourceLocator }`.
* **`dictionary_state`**: Resource locator to pre-populate concept definitions.
* **`dictionary_resolver`**: Resource locator to load the concept resolver engine.
* **`auto_compression`**:
  - `filter_chain_threshold` (number, default: 20): Maximum linear version depth of a filter chain before suffix squashing is triggered.
  - `object_chain_threshold` (number, default: 15): Maximum linear version depth of an object change chain before suffix squashing is triggered.

---

## 3. About & Examples Configuration (`about.config.json`)

Optional documentation/example resources for the `*_about` / `*_examples` developer-assistance tools. It is kept in its own file because it changes at a different cadence than storage backends (ops concern) and tool schemas (dev concern). When the file is absent, each service falls back to its built-in default doc path (e.g. `config/about/filter.md`, `config/examples/filter.md`).

### Parameters
* **`about_and_examples`**: Mapping of documentation resources (each an array of `ResourceLocator`s).
  - `middleware_about`, `filter_about`, `filter_examples`, `object_about`, `object_examples`, `dictionary_about`, `dictionary_examples`, `event_about`, `event_examples`.

---

## 3. Tool & Schema Configuration (`tools.config.json`)

Registers the tools the LLM can access and how they validate and compile.

### Parameters
* **`tools`** (object): Key-value pair of tool registrations.
  - **`schema`** (`ResourceLocator`): Path to JSON Schema defining table columns, operations, and constraints.
  - **`engine`** (`ResourceLocator` | object): The query/execution engine. Can be a single `ResourceLocator` or a key-value mapping table-names to resource engines.
    * **Built-in Query Engines**:
      * `"memory-engine"`: In-memory arrays.
      * `"sqlite"` / `"postgres"`: Relational databases.
      * `"dataframe"`: Runs DuckDB SQL queries natively over CSV, Parquet, or JSONL files.
        * **Options**:
          * `source_file` (string, required): Path to CSV, Parquet, JSON, or JSONL.
          * `dataframe_name` (string, optional): View name registered in DuckDB (defaults to `"df"`).
    * **Custom External Adapters (`@` alias)**:
      Use `name: "@<path>"` to dynamically load an adapter module from any location. The path after `@` is resolved using these rules (in priority order):

      | Path form | Interpretation |
      |---|---|
      | `@adapters/my-engine` | Workspace-relative (default) |
      | `@/opt/hospital/engine` | Absolute path |
      | `@~/projects/adapters/engine` | Home-directory relative |

      ```json
      { "_type": "adapter", "name": "@adapters/my-engine" }
      { "_type": "adapter", "name": "@/opt/hospital/engine" }
      { "_type": "adapter", "name": "@~/projects/adapters/engine" }
      ```
      The module must call `registerAdapter(name, factory)` as a side-effect at the top level.
      Since `tsconfig.json` defines `@stateful-mcp/*` path aliases, the module itself also avoids relative imports:
      ```typescript
      // <workspaceRoot>/adapters/my-custom-engine.ts
      import { registerAdapter } from "@stateful-mcp/loader";
      import type { AdapterFactory }  from "@stateful-mcp/types";

      registerAdapter("@adapters/my-custom-engine", {
        create: async (options) => { /* your implementation */ }
      });
      ```
  - **`validation_engine`** (`ResourceLocator`, optional): Custom verification validator. A reserved slot to point to an external script or schema (e.g., custom AJV options or validation rules) to enforce advanced business constraints on filter inputs. See [validation_examples.md](file:///home/denny/lu/filter/docs/validation_examples.md) for concrete examples.
  - **`inspect`**: Configuration options for runtime inspections.
    - `expose_compiled` (boolean): Exposes fully compiled SQL statements.

---

## 4. Object Schemas and Limits

* **`object_schemas`** (object): Mapping of object schema names to their schema resource definitions.
* **`object_schema_limits`**:
  - `max_fields_per_def` (number, default: 7): Warning threshold for maximum keys in a single flat object schema (encourages nesting).
  - `max_ref_depth` (number, default: 5): Maximum recursion depth allowed during lazy reference link parsing.

---

## 5. Pagination Limits (`pagination_limits`)

An optional block that controls how many items are returned per page across paginated surfaces. Each field has a built-in default and a hard ceiling that cannot be exceeded regardless of what the caller requests.

```json
{
  "pagination_limits": {
    "log_page_size": 20,
    "examples_page_size": 5,
    "merge_conflicts_page_size": 50
  }
}
```

| Field | Default | Hard Ceiling | Surface |
|---|---|---|---|
| `log_page_size` | `20` | `200` | `log_open` / `log_next` entries per page |
| `examples_page_size` | `5` | `50` | `*_examples` tools examples per page |
| `merge_conflicts_page_size` | `50` | `500` | `event_merge_inspect` conflicts per page |

All fields must be **integers ≥ 1** if provided. The validator rejects values of `0` or below.

### Merge conflict pagination

When an `event_merge` call produces conflicts, it returns only summary counts — no inline array. Use `event_merge_inspect` to iterate through conflicts in pages:

```
event_merge         → { status: "conflict", merge_session_id, total_conflicts, pending_count }
event_merge_inspect → { conflicts: [...], has_more, next_offset, pending_count, resolved_count }
event_merge_resolve → { merge_session_id: "merge_next" }   (one conflict resolved, new session ID)
event_merge_inspect (new session, offset: N) → next page
... repeat until pending_count == 0 ...
event_merge_commit  → { commit_id }
```

`event_merge_inspect` response shape:

```json
{
  "merge_session_id": "merge_abc123",
  "conflicts": [ /* page of MergeConflict objects */ ],
  "total_conflicts": 50,
  "pending_count": 48,
  "resolved_count": 2,
  "has_more": true,
  "next_offset": 5
}
```

---

## 6. Environment Files & Substitutions (`env_sources` / `env:VAR_NAME`)

To load environment variables dynamically from filesystem files, define `env_sources` at the root of your configuration:

```json
{
  "env_sources": [
    { "_type": "file", "path": ".env", "optional": true }
  ]
}
```

### String Substitution
Any JSON configuration value prefixed with `env:` is substituted dynamically at load time with the corresponding environment variable value:

```json
{
  "postgres_connection": "env:DATABASE_URL"
}
```

---

## 6. Pinned Constants (`constants`)

You can define static or dynamic query values that are injected into every query:

```json
{
  "constants": {
    "global": { "_type": "file", "path": "config/global_constants.json" },
    "user": { "_type": "remote_url", "url": "https://api.firm.internal/users/{userId}/constants" }
  }
}
```
* **User Constant Interpolation**: The `{userId}` placeholder in the URL is dynamically substituted per-request based on the authenticated user ID executing the query.

---

## 7. Pipeline Translation (`translation`)

In `tools.config.json`, you can define an optional `translation` engine to preprocess queries or map dialect variables before query compilation:

```json
{
  "tools": {
    "search_orders": {
      "schema": { "_type": "file", "path": "schemas/orders.json" },
      "translation": { "_type": "file", "path": "translations/postgres_map.json" },
      "engine": { "_type": "adapter", "name": "postgres" }
    }
  }
}
```

---

## 8. System Environment Variables

The following system-wide environment variables can be set to configure the servers at startup:

* **`SERVICE_TYPE`** (string): Determines which service to run when using the monolith router index (`filter`, `object`, `dictionary`, `event`, or `log`).
* **`LOG_SERVICE_SECRET`** (string, optional): A 32-byte cryptographic secret used as the HMAC key to sign stateless log page tokens. If not set, a random secret is generated on startup.
* **`WORKSPACE_ID`** (string, optional): The fallback workspace identifier for the Dictionary Service when no workspace is supplied per-request. Defaults to `"global"`.

---

## 9. Worked Example: Pharmacy / Retail Setup

Here is a complete, copy-pasteable configuration for a pharmacy or retail store utilizing SQLite session state, Postgres persistent databases, and standard tools/schemas.

### 9.1 `storage.config.json`
```json
{
  "version": 1,
  "filter_session_state": {
    "_type": "adapter",
    "name": "sqlite",
    "options": { "url": "sqlite://data/filter_sessions.db" }
  },
  "filter_persistent_state": {
    "global": {
      "_type": "adapter",
      "name": "postgres",
      "options": { "url": "env:DATABASE_URL" }
    },
    "user": {
      "_type": "adapter",
      "name": "postgres",
      "options": { "url": "env:DATABASE_URL" }
    }
  },
  "object_session_state": {
    "_type": "adapter",
    "name": "sqlite",
    "options": { "url": "sqlite://data/object_sessions.db" }
  },
  "object_persistent_state": {
    "global": {
      "_type": "adapter",
      "name": "postgres",
      "options": { "url": "env:DATABASE_URL" }
    },
    "user": {
      "_type": "adapter",
      "name": "postgres",
      "options": { "url": "env:DATABASE_URL" }
    }
  },
  "dictionary_state": {
    "_type": "file",
    "path": "config/pharmacy_dictionary.json"
  },
  "dictionary_resolver": {
    "_type": "adapter",
    "name": "memory"
  },
  "auto_compression": {
    "filter_chain_threshold": 10,
    "object_chain_threshold": 10
  }
}
```

### 9.2 `tools.config.json`
```json
{
  "tools": {
    "dispense_medication": {
      "schema": {
        "_type": "file",
        "path": "schemas/dispense.json"
      },
      "translation": {
        "_type": "file",
        "path": "translations/dispense_postgres.json"
      },
      "engine": {
        "prescriptions": {
          "_type": "adapter",
          "name": "postgres",
          "options": { "url": "env:DATABASE_URL" }
        }
      },
      "inspect": {
        "expose_compiled": true
      }
    }
  },
  "object_schemas": {
    "prescription_order": {
      "_type": "file",
      "path": "schemas/prescription_order.json"
    }
  },
  "object_schema_limits": {
    "max_fields_per_def": 12,
    "max_ref_depth": 3
  }
}
```

### 9.3 Content of Referenced Paths

Below are the contents of the files referenced in the configurations above:

#### `schemas/dispense.json` (Table Schema)
Defines target table columns, data types, and supported comparison operators.
```json
{
  "table_schemas": {
    "prescriptions": {
      "filterable_properties": ["medication_name", "qty", "dispense_status", "physician_id"],
      "operators": ["eq", "neq", "lt", "leq", "gt", "geq", "like"],
      "result_shape": "json_array",
      "max_results": 100
    }
  }
}
```

#### `translations/dispense_postgres.json` (Translation Mapping)
Translates the LLM's public field name references to PostgreSQL database representations.
```json
{
  "properties": {
    "medication_name": {
      "internal": "rx_name"
    },
    "qty": {
      "internal": "quantity",
      "allowed_operators": ["eq", "lt", "gt"]
    },
    "dispense_status": {
      "internal": "status"
    }
  }
}
```

#### `schemas/prescription_order.json` (Object Validation Schema)
Strict validation schema verifying properties and value constraints for a prescription form.
```json
{
  "type": "object",
  "required": ["patient_id", "medication", "quantity"],
  "properties": {
    "patient_id": { "type": "string" },
    "medication": { "type": "string" },
    "quantity": {
      "type": "integer",
      "minimum": 1
    },
    "refills": {
      "type": "integer",
      "default": 0
    }
  }
}
```

#### `config/pharmacy_dictionary.json` (Dictionary Ontology)
Ontology coordinates translating colloquial abbreviations to standardized concept identifiers.
```json
{
  "namespaces": [
    { "id": "CLINICAL", "name": "Standard Medical Registry", "mutable": false }
  ],
  "concepts": [
    {
      "id": "CLINICAL::AMOXICILLIN",
      "namespace": "CLINICAL",
      "coordinate": "CLINICAL::AMOXICILLIN",
      "description": "Amoxicillin antibiotic prescription"
    }
  ],
  "expressions": [
    {
      "id": "expr_amox",
      "conceptId": "CLINICAL::AMOXICILLIN",
      "term": "amox shorthand",
      "regexPattern": "^amox(y)?$",
      "isCaseInsensitive": true,
      "targetAssignment": "clinical",
      "priorityWeight": 10,
      "active": true
    }
  ]
}
```

---

## 4. State References & Integrity Validation (`x-mcp-ref`)

To establish dynamic referential integrity across the stateful services, properties in JSON schemas (used by Object schemas, Event payload schemas, or Form question schemas) can be configured with the custom attribute `"x-mcp-ref"`.

### Allowed Values
*   `"filter"`: Asserts that the field value points to a valid, active filter state ID or alias in the current session.
*   `"object"`: Asserts that the field value points to a valid, active object state ID or alias in the current session.
*   `"form"`: Asserts that the field value points to a valid, active form state ID or alias in the current session.

### Schema Example
(Note: Property/field names are completely arbitrary; validation is driven solely by the `"x-mcp-ref"` keyword.)
```json
{
  "type": "object",
  "required": ["report_title", "cohort_query", "patient_record"],
  "properties": {
    "report_title": { "type": "string" },
    "cohort_query": {
      "type": "string",
      "x-mcp-ref": "filter"
    },
    "patient_record": {
      "type": "string",
      "x-mcp-ref": "object"
    }
  }
}
```

### Runtime Validation Behavior
During schema verification (e.g. `object_validate`, `form_answer`, or `event_log`), the validation runner:
1. Parses the schema to locate any `"x-mcp-ref"` directives.
2. Queries the corresponding session store (resolving aliases) to check if the state ID exists.
3. Throws a descriptive validation error if the referenced entity is missing in the current session.

---

## 5. Programmatic Integration in External Tools

External tools running in the same codebase environment or sharing the database/file persistence can bypass the MCP protocol entirely and interact with the stores programmatically.

### Middleware Exports
The package exports entrypoints for all middleware stores:
*   `stateful-mcp/middleware/filter` $\rightarrow$ `FilterStore`
*   `stateful-mcp/middleware/object` $\rightarrow$ `ObjectStore`
*   `stateful-mcp/middleware/form` $\rightarrow$ `FormStore`

### Code Example
```typescript
import { FilterStore } from "stateful-mcp/middleware/filter";
import { MemorySessionFilterStore, MemoryPersistentFilterStore } from "stateful-mcp";

// 1. Initialize store programmatically
const filterStore = new FilterStore(
  new MemorySessionFilterStore(),
  new MemoryPersistentFilterStore(),
  new Map(), // toolSchemas
  new Map(), // pinnedSchemas
  20         // auto-compression threshold
);

// 2. Fetch active rules by ID or alias
const filterNode = await filterStore.getFilter("my_active_alias", "session_id");
if (filterNode) {
  console.log("Active rules:", filterNode.rules);
}
```




