# Filter + Dictionary MCP Middleware — Implementation Plan

## Context

### What this is

A generic middleware layer for MCP (and non-MCP) tools that separates **query
structure** from **domain tool logic**. Instead of every domain tool (catalog browsing,
medical diagnosis lookup, order history, inventory, etc.) reimplementing its own filter
parameters, grouping/aggregation logic, and terminology-alias resolution, those concerns
live in two shared services that any tool can sit on top of:

- **Filter** — a composable, versioned query builder. Produces an immutable chain of
  filter checkpoints (`filter_id`) that can be extended, branched, combined via set
  operations, and eventually materialized into a `view_id` that a domain tool consumes
  directly. Owns WHERE/GROUP BY/HAVING/SORT/pagination structure — nothing else.
- **Dictionary** — resolves non-standard, user- or workspace-specific terminology
  ("the usual thing," "blue pill patients") to canonical concepts, so domain tools never
  see vernacular input, only normalized values.

Neither service knows anything about the domain tools that consume it. A tool's only
contract with this middleware is: discover what's filterable (`filter.parameters`),
build a query (`filter.init`/`filter.add`/`filter.init_view`), and accept a `view_id` or
resolved concept as input. This holds regardless of whether the caller building that
query is an LLM via an MCP tool call, or a human via a UI form — the middleware is not
agent-specific.

### Where this came from

Three source materials informed the design, each representing a different level of
maturity:

- **`stateful_tooling.md`** — the original spec. Defines the intended API surface
  (`filter.init`, `filter.add`, `filter.combine`, `filter.compress`, `filter.init_view`,
  `dictionary.add/find/resolve/remove`) and the motivating problem (tool parameter
  bloat, redundant re-filtering, alias duplication across tools).
- **`client-query-engine_ts.txt`** — a working, production, single-application
  implementation of the filter execution logic, hardcoded to one app's schema (`scans`/
  `trials` tables, `createdAt` virtual date fields, `tags[]` exploding, pivot support).
  Treated as a reference for real-world capabilities the generic engine needs to absorb
  (declaratively, not by hardcoding field names), not as code to reuse directly.
- **`medical.sql`** — a Postgres schema representing one possible persistence backend
  for the Dictionary side, modeling namespaces, canonical concepts, concept relations
  with transitive-closure caching, custom regex-based term expressions, and
  usage-weighted resolution counters. Treated as *one implementation* of a
  domain-agnostic contract, not as the contract itself — its vocabulary (jurisdictions,
  facilities, specialties, personnel; `MAIN_TERM`/`ATTRIBUTE_MODIFIER`) needs to be read
  as medical-domain *configuration* of a generic concept-resolution engine, not as fixed
  structure.

A first-pass prototype (`filter/index.ts`, `filter/types.ts`, `dictionary/index.ts`,
`dictionary/types.ts`, `loader.ts`, `memory-engine.ts`, `sqlite-engine.ts`) was built
and reviewed against this spec. That review is the basis for this plan: the prototype
proved the API shape works, but revealed that almost none of the intended decoupling
was actually structural — both stores hold state in plain in-memory `Map`s with no
`Repository` seam, the Dictionary's resolution algorithm is inlined into the store
class rather than pluggable, `combine()` produces filter nodes the execution path
doesn't know how to interpret, and `sqlite-engine.ts` exists fully decoupled but isn't
wired to anything. This plan starts over with those gaps as known-in-advance
constraints, rather than discovering them mid-build again.

### Design conclusions carried into this rebuild

These aren't proposals — they're settled decisions from the design review, stated here
as constraints the implementation must satisfy from the start:

1. **Filter state and query execution are different problems with different lifetimes.**
   State (checkpoints, version chains, saved views) needs a real, swappable
   `Repository` interface. Execution (rows in, rows out for a compiled query) needs a
   separate `QueryEngine` interface. Conflating them was the prototype's core structural
   flaw.
2. **Decoupled means "programmed against an interface," not "always a network call."**
   An in-process adapter (plain function call against an in-memory `Map`) is exactly as
   decoupled as a remote HTTP adapter, provided both satisfy the same interface. Adapter
   *selection* happens once, at config/boot time; every call after that is a normal
   method call against whichever concrete adapter was resolved.
3. **Schema/config sourcing and storage backend selection use the same resolver
   pattern** — a `_type`-discriminated locator (`file` | `remote_url` | adapter name)
   resolved once and cached, not re-resolved per call. One shared `resolveSource()`
   mechanism, not parallel implementations for schema discovery vs. storage config.
4. **Mock validation must stay local regardless of the tool's real backend.** A tool
   whose production `QueryEngine` is remote (HTTP, Postgres) still validates
   `filter.add()` operations against a small local fixture dataset via the in-memory
   engine — never against the real backend. This preserves the spec's "no backend call"
   guarantee for the query-building phase.
5. **Set operations resolve client-side, not inside backend adapters.** `filter.combine()`
   (union/intersection/difference/symmetric_difference) is implemented by calling
   `QueryEngine.execute()` once per constituent filter and combining rows in the
   middleware layer. Backend adapters — including remote ones — only ever need to
   answer "give me rows for this flat filter," never implement set-theoretic logic
   themselves.
6. **Dictionary splits into two operations with genuinely different shapes.**
   `find(query)` is structured, exact-match, tabular — it can and should reuse the same
   `Repository`/`QueryEngine` machinery as any other filterable tool table (the
   dictionary's own concept/expression data is just another dataset). `resolve(term)` is
   a ranked decision that needs a distinct, swappable `ConceptResolver` interface — its
   backend might be regex+weighted scoring, Bayesian usage counters, or vector
   similarity, none of which reduce to `property = value` predicates. `resolve()` is
   built as: gather candidates via `find()`, then apply a pluggable ranking step.
7. **A response contract's required fields must have trivial defaults.** Any backend
   satisfying `ConceptResolver` — sophisticated or a one-line stub — must be able to
   populate every required field (e.g. `score`) without fabricating meaning. This is
   what makes swapping a naive dictionary backend for a sophisticated one a config
   change rather than an interface change.
8. **Config governs per-deployment variation; new adapter *types* still require code,
   once.** Selecting among existing adapters (which storage, which engine, which
   dictionary backend, which schema source) is entirely config-driven. Introducing a
   backend type the adapter registry has never seen before (first vector-DB resolver,
   first IndexedDB repository) is a one-time framework contribution — after which every
   future deployment gets it via config alone.

### What "done" looks like

A new tool (new domain, new schema, new storage/execution backend) can be added to a
running deployment by writing configuration and schema/fixture files only — no edits to
`filter/`, `dictionary/`, or the engine implementations themselves — *provided* the
adapters it needs already exist in the registry. Extending the adapter registry itself
(a new storage type, a new resolution algorithm) is an explicit, separate, lower-frequency
activity with its own contribution path, not something every deployment is expected to do.

---

## Configuration Schema

### Unifying principle: one `ResourceLocator` shape, reused everywhere

Every place config needs to say "where does this thing come from" — filter state
storage, dictionary state storage, the dictionary resolver, a tool's schema, a tool's
execution engine, a tool's validation engine — resolves to exactly one of three kinds.
Rather than inventing a different shape per concern, the whole config is built from one
discriminated type:

```ts
type ResourceLocator =
  | { _type: "adapter"; name: string; options?: Record<string, unknown> }
    // Resolve via the adapter registry: registerAdapter(name, factory).
    // Used for anything that's a registered backend implementation —
    // storage engines, query engines, concept resolvers.
  | { _type: "file"; path: string; ttl_ms?: number }
    // Read a local file (JSON, or a JS/TS module export).
    // ttl_ms omitted/0 => resolve once, cache forever (correct default for schema/
    // translation structure). ttl_ms: N => re-resolve after N ms (for values expected
    // to drift, e.g. shared constants — see "Constants: local vs. global").
  | { _type: "remote_url"; url: string; ttl_ms?: number; headers?: Record<string, string> };
    // Fetch over HTTP. Same ttl_ms semantics as above.
```

One `resolveSource(locator: ResourceLocator)` helper handles all three kinds, in one
place, regardless of which config field is calling it. This directly replaces what would
otherwise be parallel implementations for "resolve a schema" vs. "resolve a storage
backend" — they're the same operation.

### Top-level shape

```ts
interface MiddlewareConfig {
  $schema?: string;
  version: 1;

  // Session-scoped filter state — ephemeral, TTL-cleaned, one per session_id.
  filter_session_state: ResourceLocator;

  // Persistent filter state — split by owner scope. Each may use a different adapter.
  // Both implement PersistentFilterStore; see "Filter Storage" section.
  filter_persistent_state: {
    global: ResourceLocator;
    user: ResourceLocator;
  };

  // Session-scoped object state — ephemeral, one per session_id.
  object_session_state: ResourceLocator;

  // Persistent object state — split by owner scope.
  object_persistent_state: {
    global: ResourceLocator;
    user: ResourceLocator;
  };

  // Object schema limits
  object_schema_limits?: {
    max_fields_per_def?: number;
    max_ref_depth?: number;
  };

  // State persistence for the dictionary's own tables (concepts/expressions/relations),
  // if find() is implemented via the filter engine pointed at dictionary tables.
  dictionary_state: ResourceLocator;

  // The swappable ranking/resolution backend for dictionary.resolve().
  // This is a ConceptResolver, not a plain Repository — see architecture notes.
  dictionary_resolver: ResourceLocator;

  // Constants available to every tool's translation pipelines — split by scope,
  // same three-tier pattern as persistent filter storage. See "Constants: scope
  // tiers and merge order" under Property Translation.
  constants?: {
    global?: ResourceLocator;       // org-wide, all users — e.g. official exchange rates
    user?: ResourceLocator;         // per-authenticated-user overrides — e.g. preferred currency
  };

  tools: Record<string, ToolConfig>;
}

interface ToolConfig {
  // Where filter.parameters(tool_name) reads its ToolSchema from.
  schema: ResourceLocator;

  // Production QueryEngine. Single locator = applies to every table in the tool.
  // Per-table override supported when tables genuinely need different backends
  // (e.g. one table local, one table proxied to an external API).
  engine: ResourceLocator | Record<string /* table name */, ResourceLocator>;

  // Always resolves to a fast, local, side-effect-free engine — independent of
  // `engine` above, even when `engine` is remote. Not optional in spirit, but
  // technically omittable, in which case it defaults to { _type: "adapter", name: "memory" }
  // against an empty fixture (validation becomes a no-op schema check only).
  validation_engine?: ResourceLocator;
}
```

### Full annotated example

```jsonc
{
  "$schema": "https://schemas.example.com/mcp-middleware/v1.json",
  "version": 1,

  "filter_session_state": {
    "_type": "adapter",
    "name": "memory"
  },

  "filter_persistent_state": {
    "global": {
      "_type": "adapter",
      "name": "sqlite",
      "options": { "path": "./data/filters_global.db" }
    },
    "user": {
      "_type": "adapter",
      "name": "sqlite",
      "options": { "path": "./data/filters_user.db" }
    }
  },

  "dictionary_state": {
    "_type": "adapter",
    "name": "memory"
  },

  "dictionary_resolver": {
    "_type": "adapter",
    "name": "http",
    "options": { "url": "https://internal/dictionary/resolve" }
  },

  "constants": {
    "global": {
      "_type": "remote_url",
      "url": "https://internal/constants/global",
      "ttl_ms": 3600000
    },
    "user": {
      "_type": "remote_url",
      "url": "https://internal/constants/user/{userId}",
      "ttl_ms": 900000
    }
  },

  "tools": {
    "browse_catalog": {
      "schema": {
        "_type": "file",
        "path": "./config/tools/browse_catalog.schema.json"
      },
      "engine": {
        "_type": "adapter",
        "name": "memory"
      },
      "validation_engine": {
        "_type": "adapter",
        "name": "memory",
        "options": { "fixture": "./config/tools/browse_catalog.fixture.json" }
      }
    },

    "medical_diagnosis": {
      "schema": {
        "_type": "remote_url",
        "url": "https://internal/schema/medical_diagnosis"
      },
      "engine": {
        "_type": "adapter",
        "name": "sqlite",
        "options": { "connection": "env:MEDICAL_DB_URL" }
      },
      "validation_engine": {
        "_type": "adapter",
        "name": "memory",
        "options": { "fixture": "./config/tools/medical_diagnosis.fixture.json" }
      }
    },

    "order_history": {
      "schema": { "_type": "file", "path": "./config/tools/order_history.schema.json" },
      "engine": {
        "order_items":    { "_type": "adapter", "name": "sqlite", "options": { "path": "./data/orders.db" } },
        "order_metadata": { "_type": "adapter", "name": "http", "options": { "url": "https://internal/orders/meta" } }
      },
      "validation_engine": {
        "_type": "adapter",
        "name": "memory",
        "options": { "fixture": "./config/tools/order_history.fixture.json" }
      }
    }
  }
}
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `version` | yes | Config format version — fail loud on mismatch, don't silently ignore unknown fields |
| `filter_session_state` | yes | Always `_type: "adapter"` — ephemeral, TTL-scoped |
| `filter_persistent_state.global` | yes | Always `_type: "adapter"` — durable, read-heavy, privilege-gated writes |
| `filter_persistent_state.user` | yes | Always `_type: "adapter"` — durable, partitioned by `userId` |
| `dictionary_state` | yes (if `find()` uses filter engine) | Same shape/constraint as above |
| `dictionary_resolver` | yes | `_type: "adapter"` — must resolve to something implementing `ConceptResolver`, not plain `Repository` |
| `tools.<name>.schema` | yes | Any of the three locator kinds |
| `tools.<name>.engine` | yes | Single locator, or per-table map |
| `tools.<name>.validation_engine` | no | Defaults to local memory adapter against an empty fixture if omitted |

### Conventions

- **Secrets never live in this file.** Any string value may be `"env:VAR_NAME"`,
  substituted from the environment at load time (already implied by
  `options.connection: "env:MEDICAL_DB_URL"` above). Config validation should reject a
  literal-looking connection string/credential in favor of requiring this form for
  anything secret-shaped.
- **`ttl_ms` omitted (cache forever) is the default for `file` and `remote_url`
  locators**, per the earlier decision that schema/config resolution must stay fast and
  not re-fetch per call. Setting a `ttl_ms` is an explicit opt-in, mainly for values
  expected to drift (shared constants) or local dev against a schema file that's
  actively being edited — not the default for schema/translation structure, which is
  expected to be stable.
- **Recommend splitting this logical shape across files by trust boundary**, even though
  it's one schema: `tools.config.json` (per-tool `schema`/`engine`/`validation_engine` —
  reviewed, checked into git) vs. `storage.config.json` (`filter_session_state`,
  `filter_persistent_state.global`, `filter_persistent_state.user`,
  `dictionary_state`, `dictionary_resolver`, and any `env:`-backed connection info —
  deployment-specific, environment-substituted, not necessarily committed). The
  `MiddlewareConfig` type is the union of both after loading; the split is a file-layout
  convention, not a type-level distinction.
- **Unknown `_type` or unregistered `adapter.name` must fail at load time**, not fall
  back silently to a default — the prototype's `loader.ts` currently swallows bad config
  into `DEFAULT_FILTER_CONFIG`, which is convenient for a demo and dangerous for a real
  deployment. This rebuild should invert that: missing/invalid config is a startup error.

---

## Filter Storage: Session, User, and Global

Filter state has three genuinely different lifecycles, not two. Collapsing any two of
them causes real access-control or cross-session problems. Each needs its own storage
contract — three separate interfaces, each independently backed, each decoupled from
the others as well as from `FilterStore` itself.

### Three tiers

- **Session-scoped** — an agent or UI builds/branches/undoes a filter within one
  conversation/session (`session_id`, e.g. `ABCD123`). Cheap, disposable, TTL-cleaned.
  Belongs to one session, invisible everywhere else. Almost always backed by the
  `memory` adapter (or something TTL-native like Redis if the MCP process needs to
  survive a restart mid-conversation).
- **User-persistent** — belongs to one authenticated identity (`userId`), durable across
  all of that user's sessions, invisible to other users. A filter a physician saved for
  their own reuse; a partially-filled form they want to return to in a different
  conversation. This is not "a session with a longer TTL" — session is conversation
  identity, user is authenticated identity. They happen to coincide within one session
  but diverge the moment you want cross-session persistence without sharing.
- **Global-persistent** — shared across all users. A saved filter template an admin
  published; org-wide defaults. Any authenticated user can read; only privileged writers
  can mutate. Nothing writes here automatically — only explicit promotion with a
  privilege check does.

### Decoupled from each other, not just from `FilterStore`

Each tier is its own independently-backed storage contract. None of the three
implementations ever calls or knows about another. The only place data crosses tiers is
inside `FilterStore`'s `save_filter` operation (session → user or global copy) — the
backends themselves are never coupled, only the coordinator above them is.

### `OwnerScope` — the shared scoping type

Every persistent operation carries an explicit owner declaration rather than inferring
it from context:

```ts
type OwnerScope =
  | { level: "global" }
  | { level: "user"; userId: string };
```

`userId: undefined` is an invalid scope — unauthenticated callers have no user-level
scope at all. Attempting to write to user scope without a `userId` is a hard error at
the interface boundary, not a silent fallback to global or a silent drop. The interface
enforces scope validity; privilege checks (whether a given userId may write to global)
live in the auth layer above, not inside the store.

### Interfaces

```ts
// Unchanged in shape — session identity comes entirely from session_id, no OwnerScope
interface SessionFilterStore {
  get(sessionId: string, id: string): Promise<FilterState | null>;
  set(sessionId: string, id: string, state: FilterState): Promise<void>;
  delete(sessionId: string, id: string): Promise<void>;
  listSession(sessionId: string): Promise<string[]>;
  listChildren(sessionId: string, parentId: string): Promise<string[]>;
  expireSession(sessionId: string, olderThanMs?: number): Promise<void>;
}

// Now scope-aware — every operation carries an OwnerScope
interface PersistentFilterStore {
  get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
  set(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void>;
  delete(id: string, scope: OwnerScope): Promise<void>;
  findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]>;

  // Reads across scopes — returns user-level results merged with global when
  // includeGlobal is true. Each result carries its source scope so callers can
  // distinguish "your saved filter" from "org-wide template" — critical for
  // preventing a user from accidentally mutating a global entry they can read.
  list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedFilterState & { scope: OwnerScope }>>;
}

type PersistedFilterState = FilterState & { tags: string[]; description: string };
```

`set`/`delete` on a `{ level: "global" }` scope require a privilege check before the
store is called — enforced by `FilterStore`, not by the adapter itself. The adapter's
contract is only "write to the scope I was given"; it's not responsible for deciding
whether the caller was allowed to give that scope.

### Resolution order — three tiers

Every lookup (`get_filter`, `add`, `combine`, `init_view`) tries tiers in order, first
match wins:

1. Session store (current `session_id`)
2. User-persistent store (current `userId`)
3. Global-persistent store

This gives a natural override hierarchy: a user's personal saved filter shadows a
same-named global template, deliberately consistent with how local constants shadow
global constants in the translation layer. `combine()`'s resolver applies the same
three-tier lookup per id in its list — it may mix ids from all three tiers in one call.

### Promotion path (session → user or global)

1. Build/branch/undo entirely within the session store.
2. `compress(filter_id)` — session-store operation only. Collapses ancestry into a
   standalone node that still lives in the session store. Compression is about shape,
   not durability.
3. `save_filter(compressed_id, tags, description, scope: OwnerScope)` — the actual
   promotion. Reads the compressed node from the session store and writes a **copy**
   into the target scope's persistent store. Copy, not move — session history is
   preserved. A `{ level: "global" }` scope triggers a privilege check before the write;
   a `{ level: "user", userId }` scope does not (users can always save to their own
   scope). Omitting a `scope` argument is a hard error — the caller must declare intent.
4. From here the saved id resolves from the appropriate persistent store regardless of
   session or user, per the resolution order above.

### `findByTag` and `list` across scopes — the source tag matters

When an LLM or UI calls `list` or `findByTag` with `includeGlobal: true`, results from
both user and global scopes are returned together. The `scope` field on each result is
not optional decoration — it's the only way a caller can tell "this is your own saved
filter (you can edit or delete it)" from "this is an org-wide template (you can read
and extend it, but not mutate it)." Without it, a user editing what they believe is
their own filter and accidentally mutating a global template is a real failure mode, not
hypothetical.

### Config — global and user scopes may use different adapters

Global scope is read-heavy and rarely written; user scope is read-write per user and
needs partitioning by `userId`. These access patterns are different enough that backing
them with different adapters is a legitimate and supported config:

```jsonc
{
  "filter_persistent_state": {
    "global": {
      "_type": "adapter",
      "name": "postgres",
      "options": { "connection": "env:DB_URL", "table": "global_filters" }
    },
    "user": {
      "_type": "adapter",
      "name": "postgres",
      "options": { "connection": "env:DB_URL", "table": "user_filters" }
    }
  }
}
```

Both implement `PersistentFilterStore`. The same adapter type with different tables is
the common case; different adapter types per scope (e.g. global in Postgres, user-level
in Redis with a longer TTL than sessions but shorter than global) is equally valid and
requires no code changes.

### Branching / undo / redo

Falls out of the immutable version chain for free. `listChildren` (session-only —
persistent entries are compressed/standalone and have no children by definition) covers
"what branches already exist off this checkpoint" rather than requiring a separate redo
mechanism.

### Cleanup

`expireSession` — TTL-based by default, optionally triggered early by a session-close
signal from the MCP transport if one is available. User-persistent and global entries
have no TTL by default; explicit `delete` (with appropriate scope + privilege check for
global) is the only removal path.

---

## Property Translation & Derived Values

### Why this exists

The filter middleware's public contract (filter.parameters() - what an LLM or UI sees,
e.g. price, created_year) does not have to match internal storage (internal_price_usd,
a TIMESTAMPTZ column) at all. This is a separate ResourceLocator per tool -
translation - resolving to Record<tableName, TableTranslation>, deliberately not
folded into schema, since the public schema and internal translation change for
different reasons at different rates.

### Two categories, portability is per-op-family, not a clean binary

- Value-level: one row's derived value depends only on that row's other values (rename,
  unit conversion, date parts, nested JSON access). Doesn't change row cardinality.
- Shape-level: array exploding, pivoting. Changes cardinality.

Shape-level is always backend-specific. But value-level isn't uniformly portable
either - nested JSON access depends on the backend having JSON path support at all,
while arithmetic/comparison/date derivations are near-universal. Portability is
declared per op-family:

```jsonc
{ "supported_op_families": ["arithmetic", "comparison", "date", "nested_access"] }
```

Config load must fail loudly if a translation file uses an op-family the configured
engine doesn't declare.

### Pipeline DSL (value-level transforms)

A small Lisp-like interpreter, not a per-transform-kind switch statement - arbitrary
compositions as data, safely: no eval(), no arbitrary code path.

```ts
type ArgRef =
  | { $init: string }
  | { $var: string }
  | number | string | boolean;

interface PipelineStep {
  op: OpName;
  args: ArgRef[];
  return_var?: string;
  on_missing?: "null" | "error" | { literal: unknown };
}

type OpName =
  | "add" | "sub" | "mul" | "div" | "mod" | "exp"
  | "lt" | "leq" | "eq" | "neq" | "geq" | "gt"
  | "year" | "month" | "day" | "quarter" | "date_diff"
  | "get"
  | "json_parse";
```

$init vs $var is a real distinction: $init is anything known before the pipeline
runs (row columns AND config-declared constants, resolved once), $var is a prior
step's return_var (resolved as the pipeline executes, must reference a strictly
earlier step, no forward references, and colliding with an $init name is a load-time
error). This dictates SQL compilation: $init compiles to a plain column reference;
$var has no SQL equivalent, so the compiler must inline the referenced expression
tree or materialize it as a CTE binding. memory-engine.ts treats both the same
(plain environment lookups); only sqlite-engine.ts cares about the distinction.

Constants live in the $init namespace alongside row columns:

```jsonc
{
  "properties": {
    "price": {
      "internal": "internal_price_cents",
      "transform": { "pipeline": [
        { "op": "mul", "args": [{ "$init": "internal_price_cents" }, { "$init": "exchange_rate" }], "return_var": "converted" },
        { "op": "div", "args": [{ "$var": "converted" }, 100] }
      ]},
      "allowed_operators": ["eq", "gt", "geq", "lt", "leq", "between"]
    },
    "created_year": {
      "internal": "createdAt",
      "transform": { "pipeline": [{ "op": "year", "args": [{ "$init": "createdAt" }] }] },
      "allowed_operators": ["eq", "gt", "lt"]
    },
    "zip_code": {
      "internal": "raw_metadata_text",
      "transform": { "pipeline": [
        { "op": "json_parse", "args": [{ "$init": "raw_metadata_text" }], "return_var": "raw_metadata" },
        { "op": "get", "args": [{ "$var": "raw_metadata" }, "address", 0, "zip"], "on_missing": "null" }
      ]}
    }
  },
  "constants": { "exchange_rate": 1.09 }
}
```

### Constants: scope tiers and merge order

Inlining `constants` directly in the translation file works for one-offs, but anything
meant to stay consistent across multiple tools or users belongs in a scoped constants
source — not copy-pasted per translation file, where copies drift out of sync with each
other. Following the same three-tier pattern as persistent filter storage:

- **Global** — org-wide, all users. Official exchange rates, VAT rates, fiscal-year
  boundary dates. Declared in `constants.global` in the top-level config. Any tool's
  pipeline can read these. Only privileged writers should mutate the source.
- **User-level** — per authenticated identity. A user's preferred display currency, a
  clinician's default unit system (metric vs. imperial). Declared in `constants.user`.
  Scoped to `userId` at resolution time, invisible across users. Allows a user to
  override an org-wide constant for their own context without affecting anyone else.
- **Local** — per table, per translation file. A negotiated exchange rate specific to
  one data source, a tool-specific magic number. Declared inline in `TableTranslation`
  as either a direct `Record<string, unknown>` (inline literal, fine for one-offs that
  will never be shared) or its own `ResourceLocator` (for local-but-file-backed
  constants that change at their own rate).

```ts
interface MiddlewareConfig {
  constants?: {
    global?: ResourceLocator;   // org-wide
    user?: ResourceLocator;     // per userId — resolved at request time with current userId
  };
}

interface TableTranslation {
  properties: Record<string, PropertyTranslation>;
  constants?: ResourceLocator | Record<string, unknown>;  // local scope
}
```

**Merge order: global → user → local, later tiers overlay earlier ones.** A user-level
constant overrides the same-named global; a local table constant overrides both. This
is the same override hierarchy used throughout this system (local shadows global,
consistent with constants, persistent filter scope resolution order, and translation
operator narrowing). A same-named override between any two tiers produces a load-time
*warning*, not silence — accidental collisions shouldn't be silent — but it's not a
hard error, since intentional overriding is the point of having multiple tiers.

**User-level constants are resolved at request time, not at boot.** Global and local
constants can be resolved once and cached (per `ttl_ms` on their locators). User-level
constants are scoped to an authenticated `userId` that isn't known until a request
arrives — they must be resolved per-request (then cached per `userId` per `ttl_ms`),
not once at startup. This is the one place in the constants system where "resolve once
at boot" is wrong, and it's worth calling out explicitly so an adapter author doesn't
accidentally cache user constants globally.

**Shared cache keyed by locator identity, not by tool.** If three tools all reference
the same `constants.global` locator, it must be fetched and cached exactly once
system-wide — keyed by the resolved locator's identity — not once per tool. Otherwise
three independently-timed caches drift out of sync, defeating the purpose of a shared
source.

**`ttl_ms` governs refresh for all three tiers.** Schema and translation structure
default to cache-forever (`ttl_ms` omitted). Constants at any tier are explicitly
expected to drift, so each tier's locator should carry a real `ttl_ms`. Global
constants might refresh hourly; user constants might refresh per-session. Same locator
shape, same `resolveSource()` mechanism — just different values for `ttl_ms`.

**Non-determinism consequence (unchanged from before, now applies per tier).** A saved
filter whose pipeline touches any constant — at any tier — can return different results
as that constant drifts, even though the filter's own structure never changed. Constants
are execution-time context, not part of versioned filter state. Output is not
reproducible purely from a `filter_id`/`view_id` if any property resolves through a
drifting constant, at any scope tier.

### get - nested access

Path segments after the first arg must be literals, never a resolvable $init/$var
reference - a dynamic key turns a bounded accessor into a general lookup-by-computed-
key, both harder to reason about and a risk once translation files can be remote_url
sourced. on_missing is explicit (default "null"), propagating through downstream ops
the way SQL NULL does, so translation authors don't hand-write null guards everywhere.

### json_parse - for text/varchar columns storing JSON as a string

Some backends store structured data as TEXT/VARCHAR rather than a native JSON/JSONB
column. json_parse is a dedicated first pipeline step so get's implementation never
has to guess whether its input is already structured or still a raw string.
memory-engine.ts does a literal JSON.parse; sqlite-engine.ts compiles to json(col)
(SQLite JSON1) before any json_extract calls. Parse failure uses the same on_missing
handling as get, rather than throwing mid-pipeline.

### Operator narrowing and the capability manifest

Three granularities:
- Per-property: PropertyTranslation.allowed_operators narrows (never widens) the
  table-level operator list.
- Basic Type-Aware Checks: Restrict operators and aggregation functions depending on field type (e.g., numeric fields cannot utilize string-based matchers like `like` / `not_like`, and non-numeric fields cannot use mathematical aggregations like `sum`, `avg`, or `std_dev`).
- Per-table/tool, whole operation categories:

```jsonc
{ "supported_operations": ["filter", "sort", "aggregate"] }
```

If combine isn't declared for a table, filter.parameters() simply doesn't advertise it.

### Load-time validation (fail-loud, consistent with the rest of the plan)

- Unknown op name, or an op-family the engine's supported_op_families doesn't include
  -> startup error, not a runtime failure on first use.
- $var referencing an undeclared or later return_var -> startup error.
- return_var colliding with an $init name -> startup error.
- Pipeline depth capped, return_var reference graph checked for cycles, at load time.
- SQL compilation of every literal argument reuses the existing escapeValue()
  discipline already required for FilterCondition values.

---

## Backend Adapter Taxonomy

Not every `QueryEngine` adapter is the same *kind* of thing, even though they all
satisfy the same interface. Worth enumerating the actual categories, because each
implies a different compilation strategy and a different capability-declaration burden.
One principle holds across all of them, stated once here rather than repeated per
category: **compilation is stateless — the native target (SQL string + params, a pandas
expression, a fixed-shape API payload) is rebuilt fresh from the fully resolved filter
state on every execution, never incrementally patched.** The filter's own version chain
is what's incremental/stateful; the compiled output never is. This is what makes the
"LLM patches one field instead of re-specifying ten" benefit work at all — the LLM only
ever incrementally edits the structured `FilterCondition[]` via `filter.add()`; the
adapter always re-derives its native call from the complete resolved state, regardless
of adapter type.

### 1. Native SQL (Postgres, SQLite) — full compiler, fast path

The primary case. Filter conditions, pipeline arithmetic, and `get`/`json_parse` steps
compile into one native SQL statement executed directly via `pg`/`sqlite3`. No
intermediate materialization in JS. **Correction to the current `sqlite-engine.ts`
shape:** `compile()` returning one fully-inlined, `escapeValue()`-escaped string is
correct for "produce readable/loggable text," but wrong for actual execution — an
executing SQL adapter must produce `{ sql: string, params: unknown[] }` and use real
parameter binding (`$1`/`?` placeholders), not string escaping. These look similar but
serve different purposes; only the parameterized form is safe and lets the driver
handle native types (dates, jsonb) correctly. Near-full expressiveness against the
pipeline DSL and `FilterCondition` set — this is the adapter type every capability
declaration (`supported_op_families`, `supported_operations`) is written against as the
ceiling.

### 2. DataFrame (pandas/Arrow) — same compiler class, different target language

Structurally identical to the SQL case — a compiler, not an interpreter — just
targeting pandas' native surface (boolean indexing, `.query()`, `groupby`) instead of
SQL text. Should never fall back to "materialize to plain JS objects, run the in-memory
interpreter" if the operation can be pushed into pandas natively; doing so would throw
away the entire performance argument for having a compiler.

### 3. IndexedDB (client-side, browser) — hybrid compiler-with-fallback

Genuinely a third shape, not a variant of #1 or #2. IndexedDB has no query language —
only index range scans and cursor iteration. So an IndexedDB adapter must:

- Compile whatever portion of a filter maps onto an existing index (a single
  `eq`/`between`/range condition on an indexed field) to a native `IDBKeyRange` scan.
- Fall back to scanning the resulting matched rows and running the generic in-memory
  interpreter (`memory-engine.ts`'s logic, not a copy of it) for every remaining
  condition that isn't index-covered.

This means the schema/translation config needs one more declared fact per property that
the other adapter types don't need: **which properties actually have an IndexedDB
index**, so the planner knows upfront what's push-down-able versus fallback-only,
rather than discovering it by inspection at query time. Also runs entirely client-side —
no network round trip, but subject to IndexedDB's own transaction constraints
(single-store or multi-store within one `readwrite`/`versionchange` transaction), worth
keeping in mind if `filter_session_state` is ever configured to use IndexedDB too.

### 4. HTTP API that speaks the filter contract — cooperative backend, full expressiveness

This is the `HttpQueryEngine` case designed earlier ("resolve to whatever backend
plugin is"). The compiled `QueryDefinition`/pipeline is serialized as JSON and sent as-
is; the remote service runs its own interpreter or compiler against that same shape,
because it was purpose-built to speak this system's contract. Functionally equivalent
to compiling to SQL, just over the network — same expressiveness ceiling, same
capability declarations apply.

### 5. Arbitrary third-party API, small fixed parameter shape — bespoke, capability-constrained

The `category`/`min_price`/`max_price` case, and meaningfully different from #4: a
legacy or third-party API has no concept of a `FilterCondition[]` or a pipeline step —
it understands exactly its own fixed set of query parameters. "Send the JSON, let the
backend decompile it" does **not** apply here. This needs a hand-written mapping
adapter per API, whose entire job is projecting a *constrained subset* of the resolved
filter state onto that API's specific parameters.

**This is inherently more capability-limited than the other four adapter types, in a
way the current per-property/per-operator declarations don't fully capture.** A query
using only individually-legal operators on individually-legal properties can still be
inexpressible against a fixed-shape API — e.g. the API might not support combining
`category` and `price` in one call, or might not support `OR` across fields at all.
Per-property `allowed_operators` narrowing isn't sufficient for this adapter type; it
needs capability declared at the level of **whole expressible query shapes**:

```jsonc
{
  "supported_operations": ["filter"],           // no combine, no aggregate, no having
  "expressible_combinations": [
    ["category"],
    ["category", "min_price"],
    ["category", "min_price", "max_price"],
    ["min_price", "max_price"]
  ]
}
```

A query touching a property combination not in this list should fail at query-build
time (when `filter.add()`/`filter.init_view()` is called against this tool), not at
execution time — same fail-loud principle as everywhere else in this plan, just applied
one level higher than per-property operator checks.

**This is also exactly where the "LLM patches one field" benefit is realized concretely.**
Because the resolved filter state is the thing incrementally edited (`filter.add()`
touching only the one condition that changed), and the fixed-parameter adapter always
recompiles its full API payload fresh from that complete resolved state on each
execution (per the stateless-compilation principle above), the LLM never needs to
resend all ten parameters to change one — it only ever edits the structured
representation; the adapter's job is turning "the current complete resolved filter"
into "the current complete API call" every time, not diffing against a previous call.

---

## Object Middleware

### What it is

A stateful, token-efficient builder for deeply nested JSON objects — tool call
arguments, function payloads, or any structured form. Follows the same immutable
version-chain pattern as the filter middleware: every mutation returns a new
`object_id`, full branching/undo falls out for free, session/user/global persistence
tiers are identical in shape to filter storage.

The primary motivation is token efficiency: today's tool call forces an LLM to re-emit
the entire `arguments` JSON on every invocation, even when only one field changed. The
object middleware eliminates this — the LLM only ever emits deltas; the middleware
reconstructs full state from the version chain. For a 20-field schema where 2 fields
change per turn, the LLM emits 2 field-tokens per turn, not 20, every turn.

### Design constraint: small schemas, composable types

An object schema with many required fields is a design smell that should be rejected at
schema-load time, not accommodated with better tooling. The right fix is decomposition
— a `date_range` type, an `author` type, a `metadata` type, each small, each reusable,
composed at the call site via `$defs`. This is precisely what `$defs` exists for.

The middleware enforces a hard cap on fields per `$defs` entry — configurable, default
7 — declared in config, schema validation fails at load if any entry exceeds it.
Nested objects count as one field (the composition point), not as their expanded field
count. This constraint and the token-efficiency goal are the same constraint from two
directions: small composable schemas are both cheaper to delta-emit and easier for an
LLM to reason about. A delta against a 5-field object is never large even in the worst
case.

```jsonc
// mcp.config.json — object schema constraints
{
  "object_schema_limits": {
    "max_fields_per_def": 7,      // hard cap per $defs entry
    "max_ref_depth": 5            // maximum $defs nesting depth, prevents sprawl
  }
}
```

### Schema format

Standard JSON Schema with `$defs` — not a custom format. Any existing JSON Schema
validator can check the schema file itself. Existing tool-call schemas (OpenAI,
Anthropic function calling) can be dropped in as-is. The object middleware is a
stateful layer on top of a format that's already widely understood.

```jsonc
// config/objects/schedule_appointment.schema.json
{
  "$defs": {
    "DateRange": {
      "type": "object",
      "properties": {
        "start_date": { "type": "string", "format": "date" },
        "end_date":   { "type": "string", "format": "date" },
        "precision":  { "type": "string", "enum": ["day", "week", "month"] }
      },
      "required": ["start_date", "end_date"]
    },
    "ScheduleAppointment": {
      "type": "object",
      "properties": {
        "date_range":  { "$ref": "#/$defs/DateRange" },
        "patient_id":  { "type": "string" },
        "provider_id": { "type": "string" },
        "notes":       { "type": "string" }
      },
      "required": ["date_range", "patient_id", "provider_id"]
    }
  },
  "$ref": "#/$defs/ScheduleAppointment"
}
```

### Cycle detection — schema load time, not runtime

A cycle can only exist if a `$defs` entry declares a field whose type is a `$ref` that
eventually resolves back to the same entry. Since `$defs` is a static declaration in
the schema file, the entire possible reference graph is fully known at schema-load
time. Walk the `$defs` dependency graph once at load; flag any cycle as a hard schema
validation error. From that point on, every `object.init()` against a loaded schema is
guaranteed cycle-free by construction — no runtime detection needed.

Cross-object `object.ref()` references (where one live object references a field on
another live object, across `object_id`s) are a shallower, directional problem — A
refs a field on B, but B doesn't declare a type of A in its schema. A cycle there
requires A refs B and B refs A via their live fields, which is checkable at
`object.ref()` call time: "does the target path's object_id eventually include the
current object_id in its own ref chain" — a one-pass check at call time, not a full
graph walk.

### Core API

```ts
// Initialize an empty object against a named schema
object.init(schema_name: string): string  // → object_id

// Initialize pre-populated from a saved object (session → user → global lookup)
object.from_saved(saved_id: string): string  // → new session-scoped object_id

// Set one field — path is (string | number)[], consistent with pipeline DSL's get op
object.set(object_id: string, path: Path, value: unknown): string  // → new object_id

// Sparse multi-field delta — overlay only the provided fields, leave others unchanged
object.patch(object_id: string, partial: Record<string, unknown>): string  // → new object_id

// Embed a lazy reference to another object's field — resolves at object.resolve() time
object.ref(object_id: string, path: Path, source_object_id: string, source_path: Path): string

// Append a new empty item to an array field (required before set() on that index)
object.array_append(object_id: string, path: Path): string  // → new object_id

// Remove an array item; prior object_ids correctly restore pre-removal state
object.array_remove(object_id: string, path: Path, index: number): string

// Collapse version chain into standalone snapshot — still session-scoped
object.compress(object_id: string): string  // → compressed object_id

// Check completeness + cross-field constraints; returns structured diff of missing/
// invalid paths rather than a boolean — so an LLM knows exactly what remains
object.validate(object_id: string): ValidationResult

// Promote compressed object to persistent store (user or global scope)
object.save(object_id: string, tags: string[], description: string, scope: OwnerScope): string

// Materialize final payload — fails if validate() would fail
// mode: "tool_call" (MCP/OpenAI arguments JSON) | "function" (keyword args)
object.resolve(object_id: string, mode: "tool_call" | "function"): unknown

// Full picture of current state — see "Inspect & Diff" section
object.inspect(object_id: string): ObjectInspectResult

// What changed between two object_ids (must share a version chain)
object.diff(object_id_a: string, object_id_b: string): ObjectDiffResult
```

### Two validity levels

- **Structurally consistent** — every field that has been set passes its type/enum/
  format check against the schema. Valid to checkpoint (`object.set()`/`object.patch()`
  enforce this). The only check performed at mutation time.
- **Complete** — all `required` fields (recursively through nested `$defs`) are
  populated, and all cross-field constraints are satisfied. Valid to resolve/submit.
  Checked explicitly by `object.validate()`, which returns a structured diff:

```ts
interface ValidationResult {
  valid: boolean;
  missing: Path[];         // required fields not yet set
  invalid: Array<{ path: Path; reason: string }>;   // type/format/constraint failures
  warnings: Array<{ path: Path; message: string }>; // e.g. cross-tier constant collisions
}
```

`object.resolve()` calls `validate()` internally and fails with the same structured
diff if incomplete — never silently emits a partial payload.

### Cross-field constraints

Some validity rules span fields and can't be expressed as per-field type checks
(`start_date < end_date`). Declared in the schema using the same pipeline DSL op
vocabulary, with `$field` as the reference tag for sibling field values:

```jsonc
{
  "constraints": [
    {
      "op": "lt",
      "args": [{ "$field": "start_date" }, { "$field": "end_date" }],
      "error": "start_date must be before end_date"
    }
  ]
}
```

Evaluated only by `object.validate()` — not by `object.set()`, which enforces only
single-field structural consistency. This keeps mutation fast (no cross-field
evaluation on every keystroke/token) and the gate explicit (completeness is checked
once, intentionally, before submission).

### `object.ref()` — lazy field references

```ts
// In appointment object, set date_range.start_date to whatever fiscal_year.q1_start
// currently holds at resolution time — not the value at the moment ref was set
object.ref(appt_id, ["date_range", "start_date"], fiscal_year_id, ["q1_start"])
```

Resolves at `object.resolve()` time, not at `object.ref()` call time — so it tracks
the referenced object's current state. This is the "name a value once, reference it
everywhere" mechanic from the code analogy. Scope resolution for the referenced
`object_id` follows the same session → user → global lookup as everything else.

### Token efficiency in practice

An LLM turn for a recurring appointment, after the template exists:

```
object.from_saved("weekly_standup_template")   // pre-populates 6 fields
object.set(obj_id, ["date_range", "end_date"], "2024-03-31")   // one delta
object.set(obj_id, ["metadata", "author"], "Alice")             // one delta
object.resolve(obj_id, "tool_call")                             // emit payload
```

Four tool calls, two of which are one-field deltas. Versus re-emitting the full
`arguments` JSON with all 8 fields every invocation. The saving compounds across
conversations: a 50-field medical form where 3 fields change per encounter costs ~3
field-tokens of LLM output per turn, not 50, indefinitely.

### Storage — same three-tier pattern

`object_session_state`, `object_persistent_state.global`,
`object_persistent_state.user` — identical shape and config structure to the filter
storage tiers. `OwnerScope`, promotion via `object.save()`, resolution order
(session → user → global), TTL cleanup for session tier — all identical. Not repeated
here; see "Filter Storage: Session, User, and Global."

### `object_schemas` in config

```jsonc
{
  "object_schemas": {
    "schedule_appointment": {
      "_type": "file",
      "path": "./config/objects/schedule_appointment.schema.json"
    },
    "create_order": {
      "_type": "remote_url",
      "url": "https://internal/schemas/create_order"
    }
  }
}
```

Follows the same `ResourceLocator` pattern as tool schemas. Pinned at `object.init()`
time — the schema version active when an object was initialized is the one it's
validated against for its entire lifetime, even if the source schema changes later.

---

## Inspect & Diff

Both filter and object expose `inspect()` and `diff()` as first-class operations.
Neither is a read of raw stored state — both reconstruct the full resolved picture
(ancestry collapsed, refs resolved, translation applied) so the output is what an LLM
or developer actually needs to reason about the current situation, not an internal
implementation artifact.

### `filter.inspect(filter_id)`

```ts
interface FilterInspectResult {
  filter_id: string;
  tool_name?: string;
  table_name?: string;

  // Full rule chain — all ancestor nodes collapsed in order, oldest first.
  // Uses public property names only — never internal column names.
  resolved_rules: FilterCondition[];

  // Ordered list of ancestor filter_ids from root to this node
  parent_chain: string[];

  // Present only if this is a combine() node
  combined?: { operation: string; ids: string[] };

  // Modifier (group_by, aggregations) if one is attached to this filter
  modifier?: ModifierState;

  // View (limit, offset, having) if this filter has been materialized as a view
  view?: ViewState;

  // The public TableSchema this filter was validated against, pinned at init() time.
  // Public property names and operators only — no internal column names, no
  // translation mapping, no pipeline steps.
  schema_snapshot: TableSchema;

  scope: "session" | OwnerScope;
  created_at: string;

  // Only present when expose_compiled: true in tool config — see note below.
  compiled?: {
    query_definition: QueryDefinition;
    sql?: string;
    params?: unknown[];
  };
}
```

**`compiled` is opt-in, absent by default.** The internal `QueryDefinition` (with
internal column names), SQL text, and parameter bindings are an adapter concern — they
are never part of the public MCP tool surface unless explicitly enabled in config:

```jsonc
{
  "tools": {
    "medical_diagnosis": {
      "inspect": { "expose_compiled": false }  // default — omit entirely
    },
    "browse_catalog": {
      "inspect": { "expose_compiled": true }   // opt-in for non-sensitive backends
    }
  }
}
```

This is a security boundary, not just an abstraction preference. An LLM (or any caller)
that can invoke `filter.inspect()` should never be able to infer the real database
schema from the output — internal column names, table structure, and pipeline
translation steps are operational infrastructure. The default is `false`; `true` is an
explicit operator decision that the internal schema for this tool is not sensitive
(local dev, a tool whose backing table is already public, etc.).

When `expose_compiled: false` (the default): `compiled` is absent entirely — not null,
not redacted, just not present. No signal that compiled output even exists.

**Debugging still works — it just moves to the right layer.** A developer who needs to
see the compiled SQL inspects it at the adapter level directly: adapter-level logs, a
dev-only admin tool, or the adapter's own debug mode. The two audiences (LLM callers
vs. developers debugging the translation layer) have different trust levels and should
not share the same inspection surface.

**`TableTranslation` itself follows the same rule.** The property rename map, pipeline
steps, and internal column names are server-side config read at boot — never serialized
into any tool response. `filter.parameters()` returns only the public `TableSchema`
(public property names, allowed operators, supported operations). Nothing in any public
response reveals `internal: "internal_price_cents"` from a translation entry.

### `object.inspect(object_id)`

```ts
interface ObjectInspectResult {
  object_id: string;
  schema_name: string;

  // ISO timestamp the schema was pinned — what version of the schema this object
  // was initialized against, even if the source schema has since changed
  schema_pinned_at: string;

  // Fully reconstructed current state — ancestry collapsed, all refs eagerly resolved
  // against their current source values. What resolve() would produce if valid.
  current_state: Record<string, unknown>;

  // Only this node's own contribution — fields set/patched at exactly this object_id,
  // not inherited from ancestors or templates. Lets you see what the LLM emitted
  // at this specific step vs. what came from prior steps or from_saved().
  delta_only: Record<string, unknown>;

  // Refs declared but not yet resolved — present between object.ref() and
  // object.resolve(), so an LLM can audit what lazy references exist
  unresolved_refs: Array<{
    path: Path;
    source_object_id: string;
    source_path: Path;
  }>;

  parent_chain: string[];

  // Full validation state — same as calling object.validate() directly
  validation: ValidationResult;

  // Quick completeness summary without having to parse the full validation result
  completeness: {
    total_required: number;
    set_required: number;
    unset_required: Path[];
  };

  scope: "session" | OwnerScope;
  created_at: string;
}
```

The `current_state` vs. `delta_only` split is the key debugging surface: `delta_only`
is what was emitted at exactly this checkpoint; `current_state` is the full picture
including everything inherited from the version chain and resolved from templates. Seeing
both immediately tells you whether a field came from the template (`from_saved`) or from
a delta, without walking the version chain manually.

### `filter.diff(id_a, id_b)` and `object.diff(id_a, id_b)`

```ts
interface FilterDiffResult {
  added: FilterCondition[];     // rules present in id_b but not id_a
  removed: FilterCondition[];   // rules present in id_a but not id_b
  modifier_changed: boolean;
  view_changed: boolean;
}

interface ObjectDiffResult {
  changes: Array<{
    path: Path;
    before: unknown;   // value in id_a (undefined if not set)
    after: unknown;    // value in id_b (undefined if not set)
  }>;
  refs_added: Array<{ path: Path; source_object_id: string; source_path: Path }>;
  refs_removed: Array<{ path: Path }>;
}
```

Both `diff()` operations require the two ids to share a version chain — diffing across
unrelated filter or object lineages is a hard error, not a best-effort comparison.
Internally, diff is "inspect both, compare `resolved_rules`/`current_state`" — it
falls out almost for free once inspect is implemented, sharing the same ancestry
reconstruction logic.

**Primary use case for LLMs:** after several turns of building a complex filter or
object, call `diff(first_id, current_id)` to produce a compact summary of everything
that changed in this conversation, without re-reading the full inspect output. Useful
both for "confirm what I just built" and for "show me the delta before I compress and
save."

This is the right question to resolve before writing the roadmap, because the answer determines whether the adapter registry is one thing or two completely separate runtimes.