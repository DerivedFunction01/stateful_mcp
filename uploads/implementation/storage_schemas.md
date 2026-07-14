# Storage Schemas — Filter + Dictionary MCP Middleware

Storage layouts for Filter, Dictionary, and Object middleware across three paradigms:
1. Relational (SQLite / PostgreSQL)
2. Key-Value Browser Storage (IndexedDB)
3. Append-Only Flat Files (JSONL Event Log)

Where SQLite and PostgreSQL differ, notes call it out explicitly.
SQLite: `JSON` columns are `TEXT` queried via JSON1 functions (`json_extract`, `json()`).
PostgreSQL: use native `JSONB`.
SQLite has no `gen_random_uuid()` — generate UUIDs in application code (`crypto.randomUUID()`).

---

## 1. Relational Database Schemas (SQLite / PostgreSQL)

### A. Filter Persistence

```sql
-- Immutable node in a filter version chain.
-- scope_level distinguishes session nodes from persistent ones within one table.
CREATE TABLE filters (
  filter_id         VARCHAR(100) PRIMARY KEY,
  tool_name         VARCHAR(150) NULL,
  table_name        VARCHAR(150) NULL,
  parent_filter_id  VARCHAR(100) NULL REFERENCES filters(filter_id) ON DELETE SET NULL,

  -- Three-tier scoping
  scope_level       VARCHAR(30) NOT NULL DEFAULT 'session'
                    CHECK (scope_level IN ('session', 'user', 'global')),
  session_id        VARCHAR(150) NULL,   -- populated for scope_level = 'session'
  user_id           VARCHAR(100) NULL,   -- populated for scope_level = 'user'

  -- Combined-node metadata (set when this node is the result of filter.combine())
  combined_operation  VARCHAR(50) NULL
                      CHECK (combined_operation IN ('union','intersection','difference','symmetric_difference')),
  combined_ids        TEXT NULL,         -- JSON array of constituent filter_ids

  -- Public TableSchema pinned at init() time — never includes internal column names
  schema_snapshot   TEXT NULL,           -- JSON-serialized public TableSchema

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for session cleanup and scope lookups
CREATE INDEX idx_filters_session ON filters(session_id, scope_level);
CREATE INDEX idx_filters_scope   ON filters(scope_level, user_id);
CREATE INDEX idx_filters_parent  ON filters(parent_filter_id);

-- Rules (conditions) appended at a specific filter node.
-- Stores only the delta for this node — full chain reconstructed via parent traversal.
CREATE TABLE filter_rules (
  id           SERIAL PRIMARY KEY,                         -- INTEGER for SQLite
  filter_id    VARCHAR(100) NOT NULL REFERENCES filters(filter_id) ON DELETE CASCADE,
  property     VARCHAR(150) NOT NULL,                      -- public property name only
  operator     VARCHAR(50)  NOT NULL,
  value        TEXT         NOT NULL,                      -- JSON-stringified value
  index_order  INTEGER      NOT NULL,                      -- preserves evaluation order
  UNIQUE(filter_id, index_order)
);

-- Modifiers (group_by + aggregations) attached to a filter
CREATE TABLE modifiers (
  mod_id        VARCHAR(100) PRIMARY KEY,
  filter_id     VARCHAR(100) NULL REFERENCES filters(filter_id) ON DELETE SET NULL,
  columns       TEXT         NOT NULL,   -- JSON array of column names
  aggregations  TEXT         NOT NULL,   -- JSON array of Aggregation objects
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Materialized views (filter + optional modifier + pagination)
CREATE TABLE views (
  view_id        VARCHAR(100) PRIMARY KEY,
  filter_id      VARCHAR(100) NOT NULL REFERENCES filters(filter_id) ON DELETE CASCADE,
  mod_id         VARCHAR(100) NULL REFERENCES modifiers(mod_id) ON DELETE SET NULL,
  having_id      VARCHAR(100) NULL,      -- future: reference to a having-clause filter
  results_limit  INTEGER NULL,
  results_offset INTEGER NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved filter/view templates — user and global scope only (not session)
CREATE TABLE saved_filters (
  id           VARCHAR(100) PRIMARY KEY,  -- references filter_id or view_id
  tags         TEXT         NOT NULL,     -- JSON array of strings
  description  TEXT         NOT NULL,
  scope_level  VARCHAR(30)  NOT NULL CHECK (scope_level IN ('global', 'user')),
  user_id      VARCHAR(100) NULL,         -- required when scope_level = 'user'
  saved_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT chk_user_scope CHECK (
    scope_level = 'global' OR (scope_level = 'user' AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_saved_filters_scope ON saved_filters(scope_level, user_id);
CREATE INDEX idx_saved_filters_tags  ON saved_filters USING GIN (tags);   -- Postgres only
-- SQLite: use a separate saved_filter_tags junction table for tag search
```

### B. Dictionary Persistence

```sql
-- Namespaces categorizing canonical concepts.
-- Topic-agnostic: medical deployments configure 'SNOMED'/'ICD-10',
-- catalog deployments configure 'INTERNAL'/'PARTNER', etc.
CREATE TABLE namespaces (
  code                      VARCHAR(50) PRIMARY KEY,
  description               TEXT NULL,
  is_public                 BOOLEAN NOT NULL DEFAULT TRUE,
  is_external_private       BOOLEAN NOT NULL DEFAULT FALSE,
  external_private_source   VARCHAR(100) NULL,
  api_url                   VARCHAR(2048) NULL,
  api_url_params            TEXT NULL,             -- JSON object of URL param substitutions
  api_request_payload       TEXT NULL,             -- JSON payload sent to the API
  api_response_display_path VARCHAR(255) NULL       -- dot-path into API response for display string
);

-- Canonical concepts
CREATE TABLE concepts (
  id               VARCHAR(100) PRIMARY KEY,    -- app-generated UUID
  namespace_code   VARCHAR(50)  NOT NULL REFERENCES namespaces(code) ON DELETE RESTRICT,
  standard_code    VARCHAR(100) NOT NULL,       -- e.g. '38341003', 'ITEM_SKU_TYPE'
  display          VARCHAR(255) NOT NULL,       -- fallback display string
  description      TEXT NULL,
  designation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(namespace_code, standard_code, designation_date)
);

CREATE INDEX idx_concepts_lookup ON concepts(namespace_code, standard_code);

-- Concept relations (EQUIVALENT, NARROWER_THAN, WIDER_THAN)
CREATE TABLE relations (
  id                VARCHAR(100) PRIMARY KEY,
  concept_id        VARCHAR(100) NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  linked_id         VARCHAR(100) NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50)  NOT NULL CHECK (relationship_type IN ('EQUIVALENT','NARROWER_THAN','WIDER_THAN')),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  designation_date  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (concept_id <> linked_id)
);

-- Term expressions (alias → concept mappings, regex-based)
-- topic-agnostic: target_role replaces medical 'target_assignment'
-- Deployments configure which role values are valid for their domain
CREATE TABLE expressions (
  id                  VARCHAR(100) PRIMARY KEY,
  term                VARCHAR(255) NOT NULL,        -- human-friendly label
  regex_pattern       TEXT         NOT NULL,        -- compiled dynamically at query time
  is_case_insensitive BOOLEAN      NOT NULL DEFAULT TRUE,
  target_role         VARCHAR(100) NOT NULL DEFAULT 'primary',   -- domain-configured role
  concept_id          VARCHAR(100) NULL REFERENCES concepts(id) ON DELETE CASCADE,
  priority_weight     INTEGER      NOT NULL DEFAULT 1,
  active              BOOLEAN      NOT NULL DEFAULT TRUE,
  workspace_id        VARCHAR(100) NOT NULL DEFAULT 'global',    -- scopes expressions by tenant/workspace
  description         TEXT NULL,
  tags                TEXT         NOT NULL DEFAULT '[]',        -- JSON array
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_expressions_lookup ON expressions(workspace_id, active);

-- Usage-weighted resolution counters (for auto-suggestion ranking)
-- Simple deployments may omit this table entirely and set all scores to 1.0
CREATE TABLE resolution_metrics (
  id              SERIAL PRIMARY KEY,
  expression_id   VARCHAR(100) NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  concept_id      VARCHAR(100) NOT NULL REFERENCES concepts(id)    ON DELETE CASCADE,
  workspace_id    VARCHAR(100) NOT NULL DEFAULT 'global',
  usage_count     INTEGER      NOT NULL DEFAULT 1,
  last_resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(expression_id, concept_id, workspace_id)
);

CREATE INDEX idx_resolution_weights ON resolution_metrics(expression_id, workspace_id, usage_count DESC);
```

### C. Object Middleware Persistence

```sql
-- Immutable node in an object version chain
CREATE TABLE objects (
  object_id        VARCHAR(100) PRIMARY KEY,
  schema_name      VARCHAR(150) NOT NULL,
  parent_object_id VARCHAR(100) NULL REFERENCES objects(object_id) ON DELETE SET NULL,

  -- Three-tier scoping (same pattern as filters)
  scope_level   VARCHAR(30) NOT NULL DEFAULT 'session'
                CHECK (scope_level IN ('session', 'user', 'global')),
  session_id    VARCHAR(150) NULL,
  user_id       VARCHAR(100) NULL,

  -- ISO timestamp the schema was resolved and pinned — if source schema changes later,
  -- this object continues to validate against the schema version it was initialized against
  schema_pinned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_objects_session ON objects(session_id, scope_level);
CREATE INDEX idx_objects_scope   ON objects(scope_level, user_id);
CREATE INDEX idx_objects_parent  ON objects(parent_object_id);

-- Field values and lazy references set on an object node.
-- Stores only the delta for this node.
CREATE TABLE object_fields (
  id                     SERIAL PRIMARY KEY,
  object_id              VARCHAR(100) NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,

  -- Path stored in two forms:
  -- field_path_json: the canonical form for correct reconstruction  e.g. '["date_range","start_date"]'
  -- field_path_text: dot-notation for index-range prefix queries    e.g. 'date_range.start_date'
  field_path_json        TEXT NOT NULL,
  field_path_text        VARCHAR(500) NOT NULL,

  field_value            TEXT NULL,              -- JSON-stringified scalar value
  is_ref                 BOOLEAN NOT NULL DEFAULT FALSE,
  ref_source_object_id   VARCHAR(100) NULL REFERENCES objects(object_id) ON DELETE SET NULL,
  ref_source_path_json   TEXT NULL,             -- JSON array of the ref's source path

  UNIQUE(object_id, field_path_json)
);

-- Index on text path for prefix queries (used by inspect/diff to walk subtrees)
CREATE INDEX idx_object_fields_path ON object_fields(object_id, field_path_text);

-- Saved object templates (user and global scope only)
CREATE TABLE saved_objects (
  id           VARCHAR(100) PRIMARY KEY,
  tags         TEXT        NOT NULL,      -- JSON array
  description  TEXT        NOT NULL,
  scope_level  VARCHAR(30) NOT NULL CHECK (scope_level IN ('global', 'user')),
  user_id      VARCHAR(100) NULL,
  saved_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT chk_obj_user_scope CHECK (
    scope_level = 'global' OR (scope_level = 'user' AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_saved_objects_scope ON saved_objects(scope_level, user_id);
```

### D. Session Expiry (shared utility)

```sql
-- Optional: a single housekeeping query to expire old session-scoped nodes.
-- Run on a schedule (e.g. every hour) or on session-close signal.

DELETE FROM filters
WHERE scope_level = 'session'
  AND created_at < NOW() - INTERVAL '24 hours';   -- PostgreSQL syntax
  -- SQLite: WHERE scope_level = 'session' AND created_at < datetime('now', '-24 hours')

DELETE FROM objects
WHERE scope_level = 'session'
  AND created_at < NOW() - INTERVAL '24 hours';
```

---

## 2. IndexedDB Schema (Browser — future build target)

IndexedDB uses object stores without relational constraints. App-level validation
enforces all constraints at write time. Scoping (session/user/global) is stored as a
field on each record, not enforced by the engine.

| Object Store | keyPath | Indices | Description |
|---|---|---|---|
| `filters` | `filterId` | `sessionId` (unique:false), `scopeLevel+userId` (compound), `parentFilterId` | Version chain nodes |
| `filter_rules` | `id` (auto) | `filterId` (unique:false) | Rule deltas per node |
| `modifiers` | `modId` | `filterId` (unique:false) | Group-by/aggregation settings |
| `views` | `viewId` | `filterId` (unique:false) | Materialized view targets |
| `saved_filters` | `id` | `scopeLevel+userId` (compound), `tags` (multiEntry:true) | Persistent filter metadata |
| `namespaces` | `code` | (none) | Dictionary namespaces |
| `concepts` | `id` | `namespaceCode` (unique:false), `standardCode` (unique:false) | Canonical concepts |
| `expressions` | `id` | `workspaceId` (unique:false), `tags` (multiEntry:true), `active` | Alias patterns |
| `resolution_metrics` | `id` (auto) | `expressionId+workspaceId` (compound) | Usage counters |
| `objects` | `objectId` | `sessionId` (unique:false), `scopeLevel+userId` (compound), `parentObjectId` | Object version nodes |
| `object_fields` | `id` (auto) | `objectId` (unique:false), `fieldPathText` (unique:false) | Field deltas |
| `saved_objects` | `id` | `scopeLevel+userId` (compound), `tags` (multiEntry:true) | Persistent object metadata |

**Notes:**
- Compound indexes (`scopeLevel+userId`) must be created as `IDBIndex` over an array
  key path: `store.createIndex("scope_user", ["scopeLevel","userId"])`.
- `multiEntry: true` on `tags` allows querying by individual tag values.
- IndexedDB is a browser-only API — exclude from the main Node/Bun build target.
  Gate behind a separate `src/browser.ts` entry point.

---

## 3. Append-Only Flat File Schema (JSONL Event Log)

State is an append-only stream of JSON events. Replaying the full log from the
beginning reconstructs the complete in-memory state graph. Never mutate or truncate
the file during normal operation — only append. Compaction (rewriting to a snapshot)
is an explicit admin operation, not automatic.

### Event envelope (every line)

```jsonc
{
  "event_id":   "uuid-v4",
  "event_type": "FILTER_CREATED",          // see event types below
  "timestamp":  "2024-03-15T10:30:00Z",   // ISO 8601
  "session_id": "ABCD123",                 // nullable
  "user_id":    "user_42",                 // nullable
  "scope_level": "session",               // "session" | "user" | "global"
  "payload":    { ... }                    // event-specific fields
}
```

### Filter events

| `event_type` | `payload` fields |
|---|---|
| `FILTER_CREATED` | `filterId, toolName, tableName, parentFilterId, schemaSnapshot` |
| `FILTER_RULES_ADDED` | `filterId, rules: [{property, operator, value}], indexOrder` |
| `FILTER_COMBINED` | `filterId, operation, constituentIds: string[]` |
| `MODIFIER_CREATED` | `modId, filterId, columns, aggregations` |
| `VIEW_CREATED` | `viewId, filterId, modId, havingId, limit, offset` |
| `FILTER_COMPRESSED` | `newFilterId, sourceFilterId, resolvedRules` |
| `FILTER_SAVED` | `id, tags, description, scopeLevel, userId` |
| `SESSION_EXPIRED` | `sessionId, purgedFilterIds: string[]` |

### Dictionary events

| `event_type` | `payload` fields |
|---|---|
| `NAMESPACE_ADDED` | `code, description, isPublic, isExternalPrivate, externalPrivateSource` |
| `CONCEPT_ADDED` | `id, namespaceCode, standardCode, display, designationDate` |
| `RELATION_ADDED` | `id, conceptId, linkedId, relationshipType, active` |
| `EXPRESSION_ADDED` | `id, term, regexPattern, isCaseInsensitive, targetRole, conceptId, priorityWeight, workspaceId, tags, description` |
| `EXPRESSION_DEACTIVATED` | `id` |
| `RESOLUTION_RECORDED` | `expressionId, conceptId, workspaceId` |

### Object events

| `event_type` | `payload` fields |
|---|---|
| `OBJECT_CREATED` | `objectId, schemaName, parentObjectId, schemaPinnedAt, scopeLevel` |
| `OBJECT_FIELD_SET` | `objectId, fieldPathJson, fieldPathText, fieldValue, isRef, refSourceObjectId, refSourcePathJson` |
| `OBJECT_ARRAY_APPENDED` | `objectId, fieldPathJson, fieldPathText, newIndex` |
| `OBJECT_ARRAY_REMOVED` | `objectId, fieldPathJson, fieldPathText, removedIndex` |
| `OBJECT_COMPRESSED` | `newObjectId, sourceObjectId` |
| `OBJECT_SAVED` | `id, tags, description, scopeLevel, userId` |
| `SESSION_EXPIRED` | `sessionId, purgedObjectIds: string[]` |

### State reconstruction sequence

```
1. Open JSONL file for reading
2. Initialize empty state:
     filters   = Map<filterId, FilterState>
     modifiers = Map<modId, ModifierState>
     views     = Map<viewId, ViewState>
     saved     = Map<id, PersistedState>
     concepts  = Map<id, Concept>
     namespaces = Map<code, Namespace>
     expressions = Map<id, Expression>
     metrics   = Map<expressionId:conceptId:workspaceId, number>
     objects   = Map<objectId, ObjectState>
     fields    = Map<objectId, Map<fieldPathJson, FieldState>>

3. Read line by line, skip malformed lines (log warning, don't abort)
4. For each event, apply to state:

   FILTER_CREATED      → filters.set(filterId, { ...payload, rules: [] })
   FILTER_RULES_ADDED  → filters.get(filterId).rules.push(...payload.rules)
   FILTER_COMBINED     → filters.set(filterId, { combined: true, ...payload })
   FILTER_COMPRESSED   → filters.set(newFilterId, { rules: resolvedRules, parent: null })
   FILTER_SAVED        → saved.set(id, { ...payload })
   SESSION_EXPIRED     → purgedFilterIds.forEach(id => filters.delete(id))

   NAMESPACE_ADDED     → namespaces.set(code, payload)
   CONCEPT_ADDED       → concepts.set(id, payload)
   EXPRESSION_ADDED    → expressions.set(id, payload)
   EXPRESSION_DEACTIVATED → expressions.get(id).active = false
   RESOLUTION_RECORDED → increment metrics counter for key

   OBJECT_CREATED      → objects.set(objectId, payload); fields.set(objectId, new Map())
   OBJECT_FIELD_SET    → fields.get(objectId).set(fieldPathJson, { fieldValue, isRef, ... })
   OBJECT_ARRAY_APPENDED → record new index slot in fields
   OBJECT_ARRAY_REMOVED  → remove index slot, shift remaining indices
   OBJECT_COMPRESSED   → copy all fields from source to new objectId; clear parent chain
   OBJECT_SAVED        → saved.set(id, payload)
   SESSION_EXPIRED     → purgedObjectIds.forEach(id => { objects.delete(id); fields.delete(id) })

5. State is fully populated and matches pre-shutdown transaction state
```

### Compaction (admin operation)

When the log grows large, compact by writing the current fully-reconstructed state
as a single `SNAPSHOT` event at the top of a new file, then appending subsequent events
to that new file. The `SNAPSHOT` event payload is the complete serialized state. During
reconstruction, if the first event is `SNAPSHOT`, skip the fold and load directly from
the snapshot payload, then continue replaying any subsequent events. Compaction should
never happen automatically during normal operation — trigger it explicitly.

---

## Cross-Paradigm Notes

| Concern | SQLite/Postgres | IndexedDB | JSONL |
|---|---|---|---|
| Concurrent writes | WAL (SQLite) / MVCC (Postgres) | Serialized transactions | Append-only — no concurrent mutation issue |
| Session cleanup | `DELETE WHERE scope_level='session' AND created_at < ...` | Iterate `sessionId` index, delete | Append `SESSION_EXPIRED` event; compaction later |
| Schema pinning | `schema_snapshot` column | `schemaSnapshot` field on record | `schemaSnapshot` in `FILTER_CREATED` payload |
| Internal column leakage | Never store internal column names in `filter_rules.property` | Same | Same |
| Scope enforcement | `CHECK` constraints + app-level privilege check | App-level only | App-level only |