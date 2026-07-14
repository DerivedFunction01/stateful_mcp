# Storage Schemas Design — Filter + Dictionary MCP Middleware

This document defines the storage layouts and schemas for persisting the state of the Filter, Dictionary, and Object middleware. It covers three storage paradigms:
1. **Relational Databases (SQLite & PostgreSQL)**
2. **Key-Value Browser Storage (IndexedDB)**
3. **Append-Only Flat Files (JSONL Event Logs)**

---

## 1. Relational Database Schemas (SQLite / PostgreSQL)

*Note: For SQLite, `JSON` columns are represented as `TEXT` and queried via JSON1 functions. For PostgreSQL, they should be mapped to the native `JSONB` type.*

### A. Filter & View Persistence

```sql
-- Represents an immutable node in a filter version chain
CREATE TABLE filters (
  filter_id VARCHAR(100) PRIMARY KEY,
  tool_name VARCHAR(150) NULL,
  table_name VARCHAR(150) NULL,
  parent_filter_id VARCHAR(100) NULL REFERENCES filters(filter_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stores the rules (conditions) appended at a specific filter node
CREATE TABLE filter_rules (
  id SERIAL PRIMARY KEY,
  filter_id VARCHAR(100) NOT NULL REFERENCES filters(filter_id) ON DELETE CASCADE,
  property VARCHAR(150) NOT NULL,
  operator VARCHAR(50) NOT NULL,
  value TEXT NOT NULL, -- JSON-stringified (SQLite) or JSONB (Postgres)
  index_order INTEGER NOT NULL, -- Preserves chain evaluation order
  UNIQUE(filter_id, index_order)
);

-- Modifiers (group_by columns and aggregation instructions)
CREATE TABLE modifiers (
  mod_id VARCHAR(100) PRIMARY KEY,
  filter_id VARCHAR(100) NULL REFERENCES filters(filter_id) ON DELETE SET NULL,
  columns TEXT NOT NULL, -- JSON Array of column names
  aggregations TEXT NOT NULL, -- JSON Array of Aggregation objects
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Materialized views (linking filters, modifiers, limits, offsets)
CREATE TABLE views (
  view_id VARCHAR(100) PRIMARY KEY,
  filter_id VARCHAR(100) NOT NULL REFERENCES filters(filter_id) ON DELETE CASCADE,
  mod_id VARCHAR(100) NULL REFERENCES modifiers(mod_id) ON DELETE SET NULL,
  having_id VARCHAR(100) NULL,
  results_limit INTEGER NULL,
  results_offset INTEGER NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved filter/view templates scoped to global or user level
CREATE TABLE saved_views (
  id VARCHAR(100) PRIMARY KEY, -- References filter_id or view_id
  tags TEXT NOT NULL, -- JSON Array of tags for discovery
  description TEXT NOT NULL,
  scope_level VARCHAR(30) NOT NULL CHECK (scope_level IN ('global', 'user')),
  user_id VARCHAR(100) NULL, -- Required if scope_level is 'user'
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_saved_views_scope ON saved_views(scope_level, user_id);
```

### B. Dictionary Persistence

```sql
-- Standard namespaces categorizing concepts
CREATE TABLE namespaces (
  code VARCHAR(50) PRIMARY KEY, -- e.g., 'SNOMED', 'LOINC', 'CUSTOM'
  description TEXT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  is_external_private BOOLEAN NOT NULL DEFAULT FALSE,
  external_private_source VARCHAR(100) NULL,
  api_url VARCHAR(2048) NULL,
  api_url_params TEXT NULL, -- JSON object
  api_request_payload TEXT NULL, -- JSON object
  api_response_display_path VARCHAR(255) NULL
);

-- Canonical concepts standard library
CREATE TABLE concepts (
  id VARCHAR(100) PRIMARY KEY, -- UUID
  namespace_code VARCHAR(50) NOT NULL REFERENCES namespaces(code) ON DELETE RESTRICT,
  standard_code VARCHAR(100) NOT NULL, -- e.g., '38341003'
  display VARCHAR(255) NOT NULL,
  designation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(namespace_code, standard_code, designation_date)
);

-- Concept relations (transitive mapping mappings)
CREATE TABLE relations (
  id VARCHAR(100) PRIMARY KEY,
  concept_id VARCHAR(100) NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  linked_id VARCHAR(100) NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('EQUIVALENT', 'NARROWER_THAN', 'WIDER_THAN')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  designation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (concept_id <> linked_id)
);

-- Active term expression mapping matches (aliases)
CREATE TABLE expressions (
  id VARCHAR(100) PRIMARY KEY,
  term VARCHAR(255) NOT NULL,
  regex_pattern TEXT NOT NULL,
  is_case_insensitive BOOLEAN NOT NULL DEFAULT TRUE,
  target_assignment VARCHAR(50) NOT NULL CHECK (target_assignment IN ('MAIN_TERM', 'ATTRIBUTE_MODIFIER', 'BOTH')),
  concept_id VARCHAR(100) NULL REFERENCES concepts(id) ON DELETE CASCADE,
  priority_weight INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  workspace_id VARCHAR(100) NOT NULL DEFAULT 'global',
  description VARCHAR(2048),
  tags TEXT NOT NULL -- JSON Array of tag strings
);

CREATE INDEX idx_expressions_lookup ON expressions(workspace_id, active);

-- Usage tracking metrics (auto-weighting resolution priority)
CREATE TABLE resolution_metrics (
  id SERIAL PRIMARY KEY,
  expression_id VARCHAR(100) NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  concept_id VARCHAR(100) NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  workspace_id VARCHAR(100) NOT NULL DEFAULT 'global',
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(expression_id, concept_id, workspace_id)
);
```

### C. Object Middleware Persistence

```sql
-- Represents an immutable node in a stateful object version chain
CREATE TABLE objects (
  object_id VARCHAR(100) PRIMARY KEY,
  schema_name VARCHAR(150) NOT NULL,
  parent_object_id VARCHAR(100) NULL REFERENCES objects(object_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stores values or references set on the object paths
CREATE TABLE object_fields (
  id SERIAL PRIMARY KEY,
  object_id VARCHAR(100) NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,
  field_path TEXT NOT NULL, -- JSON Array representing path (e.g. '["date_range", "start_date"]')
  field_value TEXT NULL, -- JSON-stringified value
  is_ref BOOLEAN NOT NULL DEFAULT FALSE,
  ref_source_object_id VARCHAR(100) NULL REFERENCES objects(object_id) ON DELETE SET NULL,
  ref_source_path TEXT NULL, -- JSON Array representing reference target path
  UNIQUE(object_id, field_path)
);

-- Saved object templates (durable configs/forms)
CREATE TABLE saved_objects (
  id VARCHAR(100) PRIMARY KEY, -- References object_id
  tags TEXT NOT NULL, -- JSON Array of tags
  description TEXT NOT NULL,
  scope_level VARCHAR(30) NOT NULL CHECK (scope_level IN ('global', 'user')),
  user_id VARCHAR(100) NULL,
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 2. IndexedDB Schema (Browser Storage)

IndexedDB uses object stores without relational SQL constraints. State is isolated by table, using a `keyPath` primary key.

| Object Store Name | Key Path (`keyPath`) | Indices (Name / `keyPath` / Options) | Description |
|---|---|---|---|
| **`filters`** | `filterId` | `parentFilterId` (unique: false) | Immutable filter version nodes |
| **`filter_rules`** | `id` (autoIncrement) | `filterId` (unique: false) | Rules associated with filters |
| **`modifiers`** | `modId` | `filterId` (unique: false) | Aggregate modifier settings |
| **`views`** | `viewId` | `filterId` (unique: false) | Materialized view targets |
| **`saved_views`** | `id` | `tags` (multiEntry: true), `scope_level` | Persistent filter metadata |
| **`dictionary_namespaces`** | `code` | (none) | Categorization namespaces |
| **`dictionary_concepts`**| `id` | `namespaceCode` (unique: false), `standardCode` | Concept definitions |
| **`dictionary_expressions`**| `id` | `workspace_id` (unique: false), `tags` (multiEntry: true) | Alias expression patterns |
| **`dictionary_metrics`** | `id` (autoIncrement) | `expression_id` (unique: false) | Auto-weighting counters |
| **`objects`** | `objectId` | `parentObjectId` (unique: false) | Immutable object version nodes |
| **`object_fields`** | `id` (autoIncrement) | `objectId` (unique: false) | Field-value and reference nodes |
| **`saved_objects`** | `id` | `tags` (multiEntry: true), `scope_level` | Persistent object metadata |

---

## 3. Append-Only Flat File Schema (JSONL)

Flat file storage for state is represented as an **Append-Only JSONL Event Log**. Rather than rewriting files upon state mutation, we stream-append JSON events. Replaying the event log from the beginning rebuilds the active state graph.

### Event Format Schema
Each line in the JSONL file is a single JSON object containing:
- `event_id`: `string` (UUID)
- `event_type`: `string`
- `timestamp`: `string` (ISO 8601)
- `session_id`: `string` (Nullable)
- `userId`: `string` (Nullable)
- `payload`: `Record<string, any>`

### Event Payload Definitions

#### 1. Filter Events
- **`FILTER_CREATED`**
  - `{ filterId, toolName, tableName, parentFilterId }`
- **`FILTER_RULES_ADDED`**
  - `{ filterId, rules: Array<{ property, operator, value }> }`
- **`MODIFIER_CREATED`**
  - `{ modId, filterId, columns, aggregations }`
- **`VIEW_CREATED`**
  - `{ viewId, filterId, modId, havingId, limit, offset }`
- **`FILTER_SAVED`**
  - `{ id, tags, description, scope_level, userId }`

#### 2. Dictionary Events
- **`CONCEPT_ADDED`**
  - `{ id, namespaceCode, standardCode, display }`
- **`EXPRESSION_ADDED`**
  - `{ id, term, regexPattern, isCaseInsensitive, targetAssignment, conceptId, priorityWeight, workspace_id, tags }`
- **`RESOLUTION_RECORDED`**
  - `{ expressionId, conceptId, workspace_id }`

#### 3. Object Events
- **`OBJECT_CREATED`**
  - `{ objectId, schemaName, parentObjectId }`
- **`OBJECT_FIELD_SET`**
  - `{ objectId, path, value, is_ref, ref_source_object_id, ref_source_path }`
- **`OBJECT_SAVED`**
  - `{ id, tags, description, scope_level, userId }`

### State Replay & Reconstruction Sequence
To reconstruct the active in-memory stores, the configuration loader reads the JSONL event log and executes a sequential fold/reduce:
1. Initialize empty caches: `filters = {}`, `objects = {}`, `dictionary = {}`.
2. Read the JSONL file line-by-line.
3. For each event type:
   - `FILTER_CREATED`: Instantiate a new tree node in `filters`.
   - `FILTER_RULES_ADDED`: Map rules to the corresponding `filterId`.
   - `OBJECT_FIELD_SET`: Write key-value or reference mappings to the target `objectId` path.
   - `RESOLUTION_RECORDED`: Retrieve the concept counter and increment it.
4. Once EOF is reached, the in-memory coordinate maps are fully populated and identical to the transaction state prior to shut down.
