# Configuration Specification

This document details how to configure the stateful MCP middleware suite. The configuration can be defined in a single file (`filter.config.json`) or split into `config/tools.config.json` and `config/storage.config.json`.

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
* **`about_and_examples`**: Mapping of documentation resources for developer assistance tools (each must be an array of `ResourceLocator`s).
  - `middleware_about`, `filter_about`, `filter_examples`, `object_about`, `object_examples`, `dictionary_about`, `dictionary_examples`, `event_about`, `event_examples`.

---

## 3. Tool & Schema Configuration (`tools.config.json`)

Registers the tools the LLM can access and how they validate and compile.

### Parameters
* **`tools`** (object): Key-value pair of tool registrations.
  - **`schema`** (`ResourceLocator`): Path to JSON Schema defining table columns, operations, and constraints.
  - **`engine`** (`ResourceLocator` | object): The query/execution engine. Can be a single `ResourceLocator` or a key-value mapping table-names to resource engines.
  - **`validation_engine`** (`ResourceLocator`, optional): Custom verification validator.
  - **`inspect`**: Configuration options for runtime inspections.
    - `expose_compiled` (boolean): Exposes fully compiled SQL statements.

---

## 4. Object Schemas and Limits

* **`object_schemas`** (object): Mapping of object schema names to their schema resource definitions.
* **`object_schema_limits`**:
  - `max_fields_per_def` (number, default: 7): Warning threshold for maximum keys in a single flat object schema (encourages nesting).
  - `max_ref_depth` (number, default: 5): Maximum recursion depth allowed during lazy reference link parsing.

---

## 5. Environment Files & Substitutions (`env_sources` / `env:VAR_NAME`)

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

