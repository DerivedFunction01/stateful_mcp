# Resource Locators & Database Specifications

This document outlines the detailed specifications for `ResourceLocator` parameters and the database schema fields required when configuring SQLite or PostgreSQL storage backends.

---

## 1. Resource Locator Types (`ResourceLocator`)

### 1.1 `file`
Loads JSON or text assets directly from the local filesystem.
* **Fields**:
  * `path` (string, required): Filesystem path relative to the workspace root.
* **Example**:
  ```json
  { "_type": "file", "path": "config/pharmacy_dictionary.json" }
  ```

### 1.2 `remote_url`
Fetches configuration or constants over HTTP/HTTPS.
* **Fields**:
  * `url` (string, required): The target endpoint.
  * `headers` (object, optional): Map of headers (e.g. `Authorization`, `Accept`).
  * `ttl_ms` (number, optional): Time-to-live caching interval in milliseconds.
* **Variable Substitutions**:
  * **Boot-Time (Environment Variables)**: Any string prefixing `env:` (e.g. `env:DATABASE_URL`) anywhere in the configuration is substituted with the value of the environment variable at server startup.
  * **Runtime (Contextual Variables)**: Any bracketed template placeholder `{variableName}` (e.g., `{userId}`, `{department}`, `{employeeId}`) is replaced dynamically at runtime on a per-request basis with the caller's contextual parameters. The parser replaces the brackets and variable names with URL-encoded parameters supplied by the client's request context. This replacement is supported in both the `url` property of `remote_url` and the `path` property of `file` locators. E.g., `"path": "config/{department}/constants.json"`.
* **Example**:
  ```json
  {
    "_type": "remote_url",
    "url": "https://api.firm.internal/users/{userId}/constants",
    "headers": { "Authorization": "Bearer token123" },
    "ttl_ms": 600000
  }
  ```

### 1.3 `adapter`
Instantiates registered database storage repositories.
* **Fields**:
  * `name` (string, required): Name of the adapter (`"sqlite"` or `"postgres"`).
  * `options` (object, required): Connection parameters:
    * `url` (string, required): Connection URL (e.g. `sqlite://data/filter_sessions.db` or `postgresql://user:pass@localhost:5432/dbname`).
* **Example**:
  ```json
  {
    "_type": "adapter",
    "name": "sqlite",
    "options": { "url": "sqlite://data/filter_sessions.db" }
  }
  ```

### 1.4 Behavior on Stateful vs. Read-Only Services

The middleware treats resource locators differently depending on whether the service requires write operations (stateful) or is read-only:

#### A. Read-Only & Configuration Services (Schemas, Dictionaries, Constants)
* **How it works**: These can be configured using `file` or `remote_url` locators. The middleware fetches or reads the entire asset at startup (or after TTL expires) and holds it in memory for instant lookups.
* **JSON/JSONL Support**: You can point a `file` locator to a static JSON ontology file for the Dictionary Service.

#### B. Stateful & Transactional Services (Filter conditions, Object states, Event logs)
* **How it works**: Stateful services require transactional mutation logic, branch merges, LCA graph traversals, and targeted garbage collection. Because of this complexity, they **require a database adapter** (`sqlite` or `postgres`).
* **Fallback Behavior**: If you configure a stateful service using a standard `.json` `file` or `remote_url` locator directly, the service falls back to its **in-memory storage engine**.
* **Special Case: JSONL Files (`.jsonl`)**: If a stateful service `file` locator points to a `.jsonl` file, the middleware treats it as a **built-in append-only file database**:
  * **Schema**: Each line in the `.jsonl` file is a single JSON-serialized object matching the exact column keys defined in Section 2 (e.g. `commitId`, `parentCommitId`, `mutations`).
  * **Startup Read**: On server initialization, the service reads the `.jsonl` file line-by-line to reconstruct the commit DAG in memory.
  * **Mutations**: Any new checkpoint or commit appends a new serialized JSON line to the file.
  * **GC/Compression**: When garbage collection or compression runs, the system rewrites the `.jsonl` file containing only the survived/flattened commits to prevent file size bloat.
* **Custom File/HTTP Backends**: To save stateful commits to other formats, you must write a custom storage adapter class (implementing the store interfaces in `src/adapters/storage/interfaces.ts`) and register it under a custom name via `registerAdapter`.

---

## 2. Database Schema Specifications

When utilizing `sqlite` or `postgres` storage adapters, the databases must implement the following structures. Columns storing arrays or objects must map to `TEXT` (JSON-serialized strings) in SQLite, and `JSONB` in PostgreSQL.

### 2.1 Filter VCS Tables

#### Table: `filter_conditions`
Stores logical condition nodes in the query builder DAG.
* **`filterId`** (VARCHAR/TEXT, Primary Key): Unique checkpoint node ID.
* **`parentFilterId`** (VARCHAR/TEXT, Nullable): Parent checkpoint ID.
* **`toolName`** (VARCHAR/TEXT): Target tool name.
* **`tableName`** (VARCHAR/TEXT): Target table name.
* **`rules`** (JSON/TEXT): Array of serialized conditions.
* **`schema_snapshot`** (JSON/TEXT, Nullable): JSON schema copy at checkpoint time.
* **`linearDepth`** (INTEGER): Distance from nearest branch or root.
* **`gcLock`** (BOOLEAN): If true, prevents pruning during GC.
* **`createdAt`** (TIMESTAMP/TEXT): Creation timestamp.

#### Table: `filter_aliases`
* **`sessionId`** (VARCHAR/TEXT): Active session.
* **`alias`** (VARCHAR/TEXT): Shorthand descriptor (e.g. `"main"`).
* **`targetId`** (VARCHAR/TEXT): Pointed commit node ID.
* *Composite Primary Key*: `(sessionId, alias)`

---

### 2.2 Object VCS Tables

#### Table: `object_states`
Stores structured document checkpoints.
* **`objectId`** (VARCHAR/TEXT, Primary Key): Unique object version ID.
* **`parentObjectId`** (VARCHAR/TEXT, Nullable): Parent object version ID.
* **`schemaName`** (VARCHAR/TEXT): Schema validator identifier.
* **`data`** (JSON/TEXT): Key-value properties of the object.
* **`linearDepth`** (INTEGER): Node chain depth.
* **`gcLock`** (BOOLEAN): Lock status.
* **`createdAt`** (TIMESTAMP/TEXT): Timestamp.

#### Table: `object_aliases`
* **`sessionId`** (VARCHAR/TEXT)
* **`alias`** (VARCHAR/TEXT)
* **`targetId`** (VARCHAR/TEXT)
* *Composite Primary Key*: `(sessionId, alias)`

---

### 2.3 Event VCS Tables

#### Table: `event_commits`
Stores VCS commits representing mutations on event logs.
* **`commitId`** (VARCHAR/TEXT, Primary Key): Unique commit ID.
* **`parentCommitId`** (VARCHAR/TEXT, Nullable): Parent commit ID.
* **`sessionId`** (VARCHAR/TEXT): Associated session.
* **`operation`** (VARCHAR/TEXT): Mutation type (`"add"`, `"update"`, `"remove"`, `"merge"`).
* **`mutations`** (JSON/TEXT): Array of mutations (detailing `event_id`, `before_data`, `data`, and `mutation_parent_ids`).
* **`mergeSourceCommitIds`** (JSON/TEXT, Nullable): Array of source merge parent IDs.
* **`mergeAcceptedIds`** (JSON/TEXT, Nullable): Array of accepted resolutions.
* **`mergeRejectedIds`** (JSON/TEXT, Nullable): Array of rejected resolutions.
* **`linearDepth`** (INTEGER): Depth.
* **`gcLock`** (BOOLEAN): Lock status.
* **`createdAt`** (TIMESTAMP/TEXT): Timestamp.

#### Table: `event_aliases`
* **`sessionId`** (VARCHAR/TEXT)
* **`alias`** (VARCHAR/TEXT)
* **`targetId`** (VARCHAR/TEXT)
* *Composite Primary Key*: `(sessionId, alias)`
