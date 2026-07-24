export const PRAGMA_WAL = "PRAGMA journal_mode = WAL;";

// ── Filter Store ──────────────────────────────────────────────────────────────

export const DDL_FILTERS = `
  CREATE TABLE IF NOT EXISTS filters (
    filter_id         TEXT PRIMARY KEY,
    tool_name         TEXT NULL,
    table_name        TEXT NULL,
    parent_filter_id  TEXT NULL,
    scope_level       TEXT NOT NULL DEFAULT 'session',
    session_id        TEXT NULL,
    user_id           TEXT NULL,
    combined_operation TEXT NULL,
    combined_ids      TEXT NULL,
    schema_snapshot   TEXT NULL,
    created_at        TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

export const DDL_FILTER_RULES = `
  CREATE TABLE IF NOT EXISTS filter_rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filter_id    TEXT NOT NULL,
    property     TEXT NOT NULL,
    operator     TEXT NOT NULL,
    value        TEXT NOT NULL,
    index_order  INTEGER NOT NULL,
    UNIQUE(filter_id, index_order),
    FOREIGN KEY(filter_id) REFERENCES filters(filter_id) ON DELETE CASCADE
  );
`;

export const DDL_SAVED_FILTERS = `
  CREATE TABLE IF NOT EXISTS saved_filters (
    id           TEXT PRIMARY KEY,
    tags         TEXT NOT NULL,
    description  TEXT NOT NULL,
    scope_level  TEXT NOT NULL,
    user_id      TEXT NULL,
    saved_at     TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

export const DDL_SESSION_ALIASES = `
  CREATE TABLE IF NOT EXISTS session_aliases (
    session_id  TEXT NOT NULL,
    alias_name  TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    PRIMARY KEY (session_id, alias_name)
  );
`;

export const IDX_FILTERS_SESSION =
	"CREATE INDEX IF NOT EXISTS idx_filters_session ON filters(session_id, scope_level);";

export const IDX_FILTERS_SCOPE =
	"CREATE INDEX IF NOT EXISTS idx_filters_scope ON filters(scope_level, user_id);";

export const SQL_GET_ALIAS =
	"SELECT target_id FROM session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_UPSERT_ALIAS = `INSERT INTO session_aliases (session_id, alias_name, target_id)
       VALUES (?, ?, ?)
       ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`;

export const SQL_DELETE_ALIAS =
	"DELETE FROM session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_LIST_ALIASES =
	"SELECT alias_name, target_id FROM session_aliases WHERE session_id = ?";

export const SQL_SELECT_FILTER_SESSION =
	"SELECT * FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'";

export const SQL_SELECT_FILTER_RULES =
	"SELECT property, operator, value FROM filter_rules WHERE filter_id = ? ORDER BY index_order ASC";

export const SQL_UPSERT_FILTER = `INSERT INTO filters (filter_id, tool_name, table_name, parent_filter_id, scope_level, session_id, user_id, combined_operation, combined_ids, schema_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(filter_id) DO UPDATE SET
           tool_name=excluded.tool_name,
           table_name=excluded.table_name,
           parent_filter_id=excluded.parent_filter_id,
           scope_level=excluded.scope_level,
           session_id=excluded.session_id,
           user_id=excluded.user_id,
           combined_operation=excluded.combined_operation,
           combined_ids=excluded.combined_ids,
           schema_snapshot=excluded.schema_snapshot`;

export const SQL_DELETE_FILTER_RULES =
	"DELETE FROM filter_rules WHERE filter_id = ?";

export const SQL_INSERT_FILTER_RULE =
	"INSERT INTO filter_rules (filter_id, property, operator, value, index_order) VALUES (?, ?, ?, ?, ?)";

export const SQL_DELETE_FILTER_SESSION =
	"DELETE FROM filters WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'";

export const SQL_SELECT_SAVED_FILTER =
	"SELECT * FROM saved_filters WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)";

export const SQL_SELECT_FILTER_PERSISTENT =
	"SELECT * FROM filters WHERE filter_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)";

export const SQL_DELETE_SAVED_FILTER = "DELETE FROM saved_filters WHERE id = ?";

export const SQL_DELETE_FILTER_PERSISTENT =
	"DELETE FROM filters WHERE filter_id = ? AND scope_level = ?";

export const SQL_UPSERT_SAVED_FILTER = `INSERT INTO saved_filters (id, tags, description, scope_level, user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           tags=excluded.tags,
           description=excluded.description,
           scope_level=excluded.scope_level,
           user_id=excluded.user_id`;

export const SQL_LIST_FILTERS_SESSION =
	"SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session'";

export const SQL_LIST_FILTERS_CHILDREN =
	"SELECT filter_id FROM filters WHERE session_id = ? AND parent_filter_id = ? AND scope_level = 'session'";

export const SQL_EXPIRE_FILTERS_SESSION_FIND =
	"SELECT filter_id FROM filters WHERE session_id = ? AND scope_level = 'session' AND created_at < ?";

export const SQL_DELETE_FILTER_BY_ID =
	"DELETE FROM filters WHERE filter_id = ?";

export const SQL_DELETE_FILTER_RULES_BY_SESSION =
	"DELETE FROM filter_rules WHERE filter_id IN (SELECT filter_id FROM filters WHERE session_id = ?)";

export const SQL_DELETE_FILTERS_BY_SESSION =
	"DELETE FROM filters WHERE session_id = ? AND scope_level = 'session'";

export const SQL_SELECT_SAVED_FILTERS_BY_SCOPE =
	"SELECT * FROM saved_filters WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)";

// ── Form Store ────────────────────────────────────────────────────────────────

export const DDL_FORMS = `
  CREATE TABLE IF NOT EXISTS forms (
    form_id          TEXT PRIMARY KEY,
    parent_form_id   TEXT NULL,
    schema_name      TEXT NOT NULL,
    scope_level      TEXT NOT NULL DEFAULT 'session',
    session_id       TEXT NULL,
    user_id          TEXT NULL,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

export const DDL_FORM_ANSWERS = `
  CREATE TABLE IF NOT EXISTS form_answers (
    form_id      TEXT NOT NULL,
    question_id  TEXT NOT NULL,
    value        TEXT NOT NULL,
    PRIMARY KEY(form_id, question_id),
    FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
  );
`;

export const DDL_FORM_SKIPPED = `
  CREATE TABLE IF NOT EXISTS form_skipped (
    form_id      TEXT NOT NULL,
    question_id  TEXT NOT NULL,
    PRIMARY KEY(form_id, question_id),
    FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
  );
`;

export const DDL_FORM_STALE = `
  CREATE TABLE IF NOT EXISTS form_stale (
    form_id      TEXT NOT NULL,
    question_id  TEXT NOT NULL,
    PRIMARY KEY(form_id, question_id),
    FOREIGN KEY(form_id) REFERENCES forms(form_id) ON DELETE CASCADE
  );
`;

export const DDL_SAVED_FORMS = `
  CREATE TABLE IF NOT EXISTS saved_forms (
    id           TEXT PRIMARY KEY,
    tags         TEXT NOT NULL,
    description  TEXT NOT NULL,
    scope_level  TEXT NOT NULL,
    user_id      TEXT NULL,
    saved_at     TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

export const DDL_FORM_SESSION_ALIASES = `
  CREATE TABLE IF NOT EXISTS form_session_aliases (
    session_id  TEXT NOT NULL,
    alias_name  TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    PRIMARY KEY (session_id, alias_name)
  );
`;

export const SQL_SELECT_FORM_SESSION =
	"SELECT * FROM forms WHERE form_id = ? AND session_id = ?";

export const SQL_SELECT_FORM_PERSISTENT =
	"SELECT * FROM forms WHERE form_id = ? AND scope_level = ?";

export const SQL_SELECT_SAVED_FORM = "SELECT * FROM saved_forms WHERE id = ?";

export const SQL_SELECT_FORM_ANSWERS =
	"SELECT * FROM form_answers WHERE form_id = ?";

export const SQL_SELECT_FORM_SKIPPED =
	"SELECT * FROM form_skipped WHERE form_id = ?";

export const SQL_SELECT_FORM_STALE =
	"SELECT * FROM form_stale WHERE form_id = ?";

export const SQL_UPSERT_FORM_SESSION = `INSERT OR REPLACE INTO forms (form_id, parent_form_id, schema_name, scope_level, session_id, created_at)
        VALUES (?, ?, ?, 'session', ?, ?)`;

export const SQL_UPSERT_FORM_PERSISTENT = `INSERT OR REPLACE INTO forms (form_id, parent_form_id, schema_name, scope_level, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`;

export const SQL_INSERT_FORM_ANSWER =
	"INSERT INTO form_answers (form_id, question_id, value) VALUES (?, ?, ?)";

export const SQL_DELETE_FORM_ANSWERS =
	"DELETE FROM form_answers WHERE form_id = ?";

export const SQL_INSERT_FORM_SKIPPED =
	"INSERT INTO form_skipped (form_id, question_id) VALUES (?, ?)";

export const SQL_DELETE_FORM_SKIPPED =
	"DELETE FROM form_skipped WHERE form_id = ?";

export const SQL_INSERT_FORM_STALE =
	"INSERT INTO form_stale (form_id, question_id) VALUES (?, ?)";

export const SQL_DELETE_FORM_STALE = "DELETE FROM form_stale WHERE form_id = ?";

export const SQL_UPSERT_SAVED_FORM = `INSERT OR REPLACE INTO saved_forms (id, tags, description, scope_level, user_id, saved_at)
        VALUES (?, ?, ?, ?, ?, ?)`;

export const SQL_DELETE_FORM = "DELETE FROM forms WHERE form_id = ?";

export const SQL_DELETE_SAVED_FORM = "DELETE FROM saved_forms WHERE id = ?";

export const SQL_LIST_FORMS_SESSION =
	"SELECT form_id FROM forms WHERE session_id = ? AND scope_level = 'session'";

export const SQL_LIST_FORMS_CHILDREN =
	"SELECT form_id FROM forms WHERE session_id = ? AND parent_form_id = ?";

export const SQL_EXPIRE_FORMS_BY_SESSION_AGE =
	"DELETE FROM forms WHERE session_id = ? AND created_at < ?";

export const SQL_EXPIRE_FORMS_BY_SESSION =
	"DELETE FROM forms WHERE session_id = ?";

export const SQL_GET_FORM_ALIAS =
	"SELECT target_id FROM form_session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_UPSERT_FORM_ALIAS =
	"INSERT OR REPLACE INTO form_session_aliases (session_id, alias_name, target_id) VALUES (?, ?, ?)";

export const SQL_DELETE_FORM_ALIAS =
	"DELETE FROM form_session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_LIST_FORM_ALIASES =
	"SELECT alias_name, target_id FROM form_session_aliases WHERE session_id = ?";

// ── Object Store ──────────────────────────────────────────────────────────────

export const DDL_OBJECTS = `
  CREATE TABLE IF NOT EXISTS objects (
    object_id         TEXT PRIMARY KEY,
    schema_name       TEXT NOT NULL,
    parent_object_id  TEXT NULL,
    scope_level       TEXT NOT NULL DEFAULT 'session',
    session_id        TEXT NULL,
    user_id           TEXT NULL,
    data              TEXT NOT NULL,
    created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
    schema_pinned_at  TEXT NULL
  );
`;

export const DDL_SAVED_OBJECTS = `
  CREATE TABLE IF NOT EXISTS saved_objects (
    id           TEXT PRIMARY KEY,
    tags         TEXT NOT NULL,
    description  TEXT NOT NULL,
    scope_level  TEXT NOT NULL,
    user_id      TEXT NULL,
    saved_at     TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

export const DDL_OBJECT_SESSION_ALIASES = `
  CREATE TABLE IF NOT EXISTS object_session_aliases (
    session_id  TEXT NOT NULL,
    alias_name  TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    PRIMARY KEY (session_id, alias_name)
  );
`;

export const SQL_GET_OBJECT_ALIAS =
	"SELECT target_id FROM object_session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_UPSERT_OBJECT_ALIAS = `INSERT INTO object_session_aliases (session_id, alias_name, target_id)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`;

export const SQL_DELETE_OBJECT_ALIAS =
	"DELETE FROM object_session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_LIST_OBJECT_ALIASES =
	"SELECT alias_name, target_id FROM object_session_aliases WHERE session_id = ?";

export const SQL_SELECT_OBJECT_SESSION =
	"SELECT * FROM objects WHERE session_id = ? AND object_id = ? AND scope_level = 'session'";

export const SQL_UPSERT_OBJECT_SESSION = `INSERT OR REPLACE INTO objects (object_id, schema_name, parent_object_id, scope_level, session_id, data, created_at, schema_pinned_at)
      VALUES (?, ?, ?, 'session', ?, ?, ?, ?)`;

export const SQL_DELETE_OBJECT_SESSION =
	"DELETE FROM objects WHERE session_id = ? AND object_id = ? AND scope_level = 'session'";

export const SQL_SELECT_SAVED_OBJECT =
	"SELECT * FROM saved_objects WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)";

export const SQL_SELECT_OBJECT_PERSISTENT =
	"SELECT * FROM objects WHERE object_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)";

export const SQL_UPSERT_OBJECT_PERSISTENT = `INSERT OR REPLACE INTO objects (object_id, schema_name, parent_object_id, scope_level, user_id, data, created_at, schema_pinned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

export const SQL_UPSERT_SAVED_OBJECT = `INSERT OR REPLACE INTO saved_objects (id, tags, description, scope_level, user_id)
      VALUES (?, ?, ?, ?, ?)`;

export const SQL_DELETE_SAVED_OBJECT = "DELETE FROM saved_objects WHERE id = ?";

export const SQL_DELETE_OBJECT_PERSISTENT =
	"DELETE FROM objects WHERE object_id = ? AND scope_level = ?";

export const SQL_LIST_OBJECTS_SESSION =
	"SELECT object_id FROM objects WHERE session_id = ? AND scope_level = 'session'";

export const SQL_LIST_OBJECTS_CHILDREN =
	"SELECT object_id FROM objects WHERE session_id = ? AND parent_object_id = ? AND scope_level = 'session'";

export const SQL_EXPIRE_OBJECTS_SESSION_AGE =
	"DELETE FROM objects WHERE session_id = ? AND scope_level = 'session' AND created_at < ?";

export const SQL_EXPIRE_OBJECTS_SESSION =
	"DELETE FROM objects WHERE session_id = ? AND scope_level = 'session'";

export const SQL_SELECT_SAVED_OBJECTS_BY_SCOPE =
	"SELECT * FROM saved_objects WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)";

// ── Event Store ───────────────────────────────────────────────────────────────

export const DDL_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    commit_id         TEXT PRIMARY KEY,
    session_id        TEXT NULL,
    parent_commit_id  TEXT NULL,
    scope_level       TEXT NOT NULL DEFAULT 'session',
    user_id           TEXT NULL,
    operation         TEXT NOT NULL,
    mutations         TEXT NOT NULL,
    created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
    linear_depth      INTEGER NOT NULL DEFAULT 0,
    gc_lock           INTEGER NOT NULL DEFAULT 0,
    merge_source_commit_ids TEXT NULL,
    merge_accepted_ids TEXT NULL,
    merge_rejected_ids TEXT NULL,
    schema_name       TEXT NOT NULL
  );
`;

export const DDL_SAVED_EVENTS = `
  CREATE TABLE IF NOT EXISTS saved_events (
    id           TEXT PRIMARY KEY,
    tags         TEXT NOT NULL,
    description  TEXT NOT NULL,
    scope_level  TEXT NOT NULL,
    user_id      TEXT NULL,
    saved_at     TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

export const DDL_EVENT_SESSION_ALIASES = `
  CREATE TABLE IF NOT EXISTS event_session_aliases (
    session_id  TEXT NOT NULL,
    alias_name  TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    PRIMARY KEY (session_id, alias_name)
  );
`;

export const SQL_GET_EVENT_ALIAS =
	"SELECT target_id FROM event_session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_UPSERT_EVENT_ALIAS = `INSERT INTO event_session_aliases (session_id, alias_name, target_id)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id, alias_name) DO UPDATE SET target_id=excluded.target_id`;

export const SQL_DELETE_EVENT_ALIAS =
	"DELETE FROM event_session_aliases WHERE session_id = ? AND alias_name = ?";

export const SQL_LIST_EVENT_ALIASES =
	"SELECT alias_name, target_id FROM event_session_aliases WHERE session_id = ?";

export const SQL_SELECT_EVENT_SESSION =
	"SELECT * FROM events WHERE session_id = ? AND commit_id = ? AND scope_level = 'session'";

export const SQL_UPSERT_EVENT_SESSION = `INSERT OR REPLACE INTO events (commit_id, session_id, parent_commit_id, scope_level, operation, mutations, created_at, linear_depth, gc_lock, merge_source_commit_ids, merge_accepted_ids, merge_rejected_ids)
      VALUES (?, ?, ?, 'session', ?, ?, ?, ?, ?, ?, ?, ?)`;

export const SQL_DELETE_EVENT_SESSION =
	"DELETE FROM events WHERE session_id = ? AND commit_id = ? AND scope_level = 'session'";

export const SQL_SELECT_SAVED_EVENT =
	"SELECT * FROM saved_events WHERE id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)";

export const SQL_SELECT_EVENT_PERSISTENT =
	"SELECT * FROM events WHERE commit_id = ? AND scope_level = ? AND (user_id = ? OR user_id IS NULL)";

export const SQL_UPSERT_EVENT_PERSISTENT = `INSERT OR REPLACE INTO events (commit_id, scope_level, user_id, parent_commit_id, operation, mutations, created_at, linear_depth, gc_lock, merge_source_commit_ids, merge_accepted_ids, merge_rejected_ids, schema_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const SQL_UPSERT_SAVED_EVENT = `INSERT OR REPLACE INTO saved_events (id, tags, description, scope_level, user_id)
      VALUES (?, ?, ?, ?, ?)`;

export const SQL_DELETE_SAVED_EVENT = "DELETE FROM saved_events WHERE id = ?";

export const SQL_DELETE_EVENT_PERSISTENT =
	"DELETE FROM events WHERE commit_id = ? AND scope_level = ?";

export const SQL_LIST_EVENTS_SESSION =
	"SELECT commit_id FROM events WHERE session_id = ? AND scope_level = 'session'";

export const SQL_LIST_EVENTS_CHILDREN =
	"SELECT commit_id FROM events WHERE session_id = ? AND parent_commit_id = ? AND scope_level = 'session'";

export const SQL_EXPIRE_EVENTS_SESSION_AGE =
	"DELETE FROM events WHERE session_id = ? AND scope_level = 'session' AND created_at < ?";

export const SQL_EXPIRE_EVENTS_SESSION =
	"DELETE FROM events WHERE session_id = ? AND scope_level = 'session'";

export const SQL_SELECT_SAVED_EVENTS_BY_SCOPE =
	"SELECT * FROM saved_events WHERE scope_level = ? AND (user_id = ? OR user_id IS NULL)";

// ── Dictionary: Concept Store ─────────────────────────────────────────────────

export const DDL_DICT_NAMESPACES = `
  CREATE TABLE IF NOT EXISTS dict_namespaces (
    code TEXT PRIMARY KEY,
    description TEXT,
    is_public INTEGER NOT NULL,
    is_external_private INTEGER NOT NULL,
    is_mutable INTEGER
  )
`;

export const DDL_DICT_CONCEPTS = `
  CREATE TABLE IF NOT EXISTS dict_concepts (
    id TEXT PRIMARY KEY,
    namespace_code TEXT NOT NULL,
    standard_code TEXT NOT NULL,
    display TEXT NOT NULL,
    description TEXT,
    designation_date TEXT,
    active INTEGER NOT NULL,
    FOREIGN KEY(namespace_code) REFERENCES dict_namespaces(code)
  )
`;

export const DDL_DICT_RELATIONS = `
  CREATE TABLE IF NOT EXISTS dict_relations (
    id TEXT PRIMARY KEY,
    concept_id TEXT NOT NULL,
    linked_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    active INTEGER NOT NULL,
    designation_date TEXT,
    FOREIGN KEY(concept_id) REFERENCES dict_concepts(id),
    FOREIGN KEY(linked_id) REFERENCES dict_concepts(id)
  )
`;

export const IDX_CONCEPT_REL_FORWARD =
	"CREATE INDEX IF NOT EXISTS idx_concept_rel_forward ON dict_relations(concept_id, active)";

export const IDX_CONCEPT_REL_REVERSE =
	"CREATE INDEX IF NOT EXISTS idx_concept_rel_reverse ON dict_relations(linked_id, active)";

export const DDL_DICT_RELATION_CACHE = `
  CREATE TABLE IF NOT EXISTS dict_relation_cache (
    ancestor_concept_id TEXT NOT NULL,
    descendant_concept_id TEXT NOT NULL,
    link_depth INTEGER NOT NULL,
    inferred_relationship_type TEXT NOT NULL,
    active INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(ancestor_concept_id, descendant_concept_id, inferred_relationship_type)
  )
`;

export const IDX_CONCEPT_CACHE_TRAVERSAL =
	"CREATE INDEX IF NOT EXISTS idx_concept_cache_traversal ON dict_relation_cache(ancestor_concept_id, active)";

export const DDL_DICT_CUSTOM_EXPRESSIONS = `
  CREATE TABLE IF NOT EXISTS dict_custom_expressions (
    id TEXT PRIMARY KEY,
    term TEXT NOT NULL,
    concept_id TEXT,
    scope_level TEXT NOT NULL,
    scope_id TEXT,
    data TEXT NOT NULL
  )
`;

export const SQL_UPSERT_DICT_CONCEPT = `INSERT OR REPLACE INTO dict_concepts (id, namespace_code, standard_code, display, description, designation_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;

export const SQL_UPSERT_DICT_NAMESPACE = `INSERT OR REPLACE INTO dict_namespaces (code, description, is_public, is_external_private, is_mutable)
       VALUES (?, ?, ?, ?, ?)`;

export const SQL_UPSERT_DICT_RELATION = `INSERT OR REPLACE INTO dict_relations (id, concept_id, linked_id, relationship_type, active, designation_date)
       VALUES (?, ?, ?, ?, ?, ?)`;

export const SQL_SELECT_DICT_CONCEPT_BY_ID =
	"SELECT * FROM dict_concepts WHERE id = ?";

export const SQL_SELECT_DICT_NAMESPACES = "SELECT * FROM dict_namespaces";

export const SQL_DELETE_DICT_RELATION_CACHE = "DELETE FROM dict_relation_cache";

export const SQL_DELETE_DICT_RELATION_CACHE_FOR =
	"DELETE FROM dict_relation_cache WHERE ancestor_concept_id = ? OR descendant_concept_id = ?";

export const SQL_SELECT_DICT_RELATIONS_FORWARD =
	"SELECT id, concept_id, linked_id, relationship_type, active, designation_date FROM dict_relations WHERE concept_id = ? AND active = 1";

export const SQL_SELECT_DICT_RELATIONS_REVERSE =
	"SELECT id, concept_id, linked_id, relationship_type, active, designation_date FROM dict_relations WHERE linked_id = ? AND active = 1";

export const SQL_SELECT_DICT_CACHE_RELATED = `SELECT c.*, rc.link_depth, rc.inferred_relationship_type 
           FROM dict_relation_cache rc 
           JOIN dict_concepts c ON rc.descendant_concept_id = c.id 
           WHERE rc.ancestor_concept_id = ? AND rc.active = 1 AND rc.link_depth <= ?`;

export const CTE_DICT_RELATED_CONCEPTS = `
      WITH RECURSIVE rel_graph(target_id, relationship_type, dir, depth) AS (
        -- Forward direct
        SELECT linked_id, relationship_type, 'forward', 1
        FROM dict_relations
        WHERE concept_id = ? AND active = 1 AND (? = 'forward' OR ? = 'both')

        UNION ALL

        -- Reverse direct with operator inversion
        SELECT concept_id, 
               CASE relationship_type 
                 WHEN 'NARROWER_THAN' THEN 'WIDER_THAN' 
                 WHEN 'WIDER_THAN' THEN 'NARROWER_THAN' 
                 ELSE 'EQUIVALENT' 
               END, 
               'reverse', 1
        FROM dict_relations
        WHERE linked_id = ? AND active = 1 AND (? = 'reverse' OR ? = 'both')

        UNION ALL

        -- Recursive forward expansion
        SELECT r.linked_id, r.relationship_type, g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.concept_id
        WHERE r.active = 1 AND g.depth < ? AND g.dir = 'forward'

        UNION ALL

        -- Recursive reverse expansion
        SELECT r.concept_id, 
               CASE r.relationship_type 
                 WHEN 'NARROWER_THAN' THEN 'WIDER_THAN' 
                 WHEN 'WIDER_THAN' THEN 'NARROWER_THAN' 
                 ELSE 'EQUIVALENT' 
               END, 
               g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.linked_id
        WHERE r.active = 1 AND g.depth < ? AND g.dir = 'reverse'
      )
      SELECT DISTINCT g.target_id, g.relationship_type, g.dir, g.depth, c.* 
      FROM rel_graph g
      JOIN dict_concepts c ON g.target_id = c.id
      WHERE c.active = 1;
    `;

export const SQL_UPSERT_DICT_RELATION_CACHE = `INSERT OR REPLACE INTO dict_relation_cache (ancestor_concept_id, descendant_concept_id, link_depth, inferred_relationship_type, active, updated_at)
           VALUES (?, ?, ?, ?, 1, ?)`;

// ── Dictionary: Custom Expression Store ───────────────────────────────────────

export const SQL_UPSERT_DICT_EXPRESSION = `INSERT OR REPLACE INTO dict_custom_expressions (id, term, concept_id, scope_level, scope_id, data)
       VALUES (?, ?, ?, ?, ?, ?)`;

export const SQL_DELETE_DICT_EXPRESSION =
	"DELETE FROM dict_custom_expressions WHERE id = ? AND scope_level = ? AND (scope_id = ? OR scope_id IS NULL)";

export const SQL_SELECT_DICT_EXPRESSION_DATA =
	"SELECT data FROM dict_custom_expressions WHERE id = ?";
