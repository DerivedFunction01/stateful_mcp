# Design Notes — Filter + Dictionary MCP Middleware

Running log of architecture decisions, ideas, and critique as this evolves.
Newest entries at the bottom of each section. Treat this as a scratchpad, not a spec —
`stateful_tooling.md` remains the source of truth for the intended API surface.

---

## Core Principle (established)

The **backend does not care how data is stored.** `FilterStore` and `DictionaryStore`
should only ever talk to a **repository interface**, never to `Map`, `fs`, `sqlite3`,
`pg`, or an HTTP client directly. Concretely, storage could be any of:

- IndexedDB (browser-embedded MCP client)
- SQLite (local file, via `sqlite-engine.ts`)
- A flat text file / JSONL append log
- A pandas/Arrow DataFrame (if the engine is Python-side)
- Postgres (per `medical.sql`, for the "real" production backend)
- A remote API call (proxying to an existing service)
- An ML model / embedding index (for fuzzy `dictionary.resolve()` lookups)

None of these should be visible above the repository interface. `QueryEngine` (execution)
and `Repository` (state persistence) are two separate seams — don't conflate them.

- `Repository` = where filter/modifier/view/dictionary *state* lives (the checkpoints,
  the version chain, the saved dictionary entries).
- `QueryEngine` = how a filter's rules actually get run *against a dataset* to produce rows
  (`memory-engine.ts`, `sqlite-engine.ts`, eventually a Postgres or pandas engine).

A tool could mix and match: state stored in SQLite, but rows executed via an API call to
an external service. These need to stay decoupled from each other, not just from `FilterStore`.

## Proposed Pattern: Config-Driven Backend Selection (VS Code style)

Idea: instead of wiring a storage backend in code (`new FilterStore(new InMemoryRepo())`),
read a config file at startup — similar to how VS Code resolves `settings.json`, cascading
across workspace/user/default scopes, and how extensions register **contribution points**
(`package.json`'s `contributes` block) rather than being hardcoded into the core.

Sketch:

```jsonc
// mcp.config.json
{
  "storage": {
    "filters": { "adapter": "sqlite", "path": "./data/filters.db" },
    "dictionary": { "adapter": "postgres", "connectionString": "env:DATABASE_URL" },
    "views": { "adapter": "memory" } // ephemeral, no need to persist
  },
  "tools": {
    "browse_catalog": {
      "engine": "memory",
      "schema": "./config/tools/browse_catalog.ts"
    },
    "medical_diagnosis": {
      "engine": "sqlite",
      "schema": "./config/tools/medical_diagnosis.ts",
      "backing": { "adapter": "postgres", "table": "diagnoses" }
    }
  }
}
```

At boot, a small **registry/resolver** reads this config and instantiates the right
adapter class per named backend (`"sqlite"`, `"postgres"`, `"memory"`, `"jsonl"`, `"api"`),
the same way VS Code resolves a `languages` or `debuggers` contribution to an actual
implementation via a registered ID string. Each adapter implements the same
`Repository`/`QueryEngine` interface, so `FilterStore`/`DictionaryStore` never know which
one they got.

This also gives you **per-tool overrides** for free — `medical_diagnosis` can persist to
Postgres while `browse_catalog` stays in-memory, without either tool's code changing.

## Critique / Open Concerns

- **Adapter registration still needs a code-side registry.** A config file can *select*
  `"sqlite"`, but something has to map the string `"sqlite"` → an actual `SqliteRepository`
  class. VS Code solves this because extensions register their contribution at load time;
  the equivalent here is an explicit `registerAdapter("sqlite", SqliteRepository)` call
  somewhere at bootstrap. The config file is a selector, not a full DI container — worth
  being explicit about that distinction so it doesn't get oversold as "fully pluggable with
  zero code."
- **Schema vs. storage config shouldn't live in the same file if they change at different
  rates.** Tool schemas (filterable properties, operators) are closer to source code —
  versioned, reviewed, deployed. Storage config (connection strings, adapter choice) is
  closer to environment/ops config — differs per deployment, often secret-bearing. Mixing
  them in one `mcp.config.json` risks the same problem `loader.ts` already has today
  (schema + mock data baked into one literal). Consider two files: `tools.config.ts`
  (schema, checked into git) and `storage.config.json` or env vars (deployment-specific,
  not checked in).
- **Async boundary.** `Map`-backed repos are synchronous; SQLite/Postgres/API adapters are
  not. `FilterStore`'s public methods (`init`, `add`, `getFilter`, etc.) are currently all
  synchronous — this only works because it's in-memory today. Moving to a real adapter
  means every method on `FilterStore`/`DictionaryStore` becomes `async`, which ripples out
  to the MCP tool handlers too. Worth deciding now whether to make everything `async` from
  the start (even the in-memory adapter) so the interface doesn't change shape later.
- **Mock execution (validation) vs. real execution are different engines by design** — don't
  let the config system default `medical_diagnosis`'s *validation* path to the same
  Postgres adapter as its production path. Mock validation should probably always resolve
  to a fast, local, side-effect-free engine (`memory-engine.ts` against a small fixture
  dataset), regardless of what the tool's real backing store is configured to. Otherwise
  `filter.add()`'s "no backend call, fast local check" property (a stated benefit in
  `stateful_tooling.md`) quietly breaks once someone points a tool at Postgres.
- **Config validation itself needs a schema** (ironically) — an `mcp.config.json` with a
  typo'd adapter name should fail loudly at boot, not silently fall back to `memory` the
  way `loader.ts`'s `catch` currently swallows bad config and returns `DEFAULT_FILTER_CONFIG`.
  That fallback behavior is convenient for a demo, dangerous for anything real.

## Open Questions

- Does the dictionary's `resolve()` ever need a genuinely different adapter shape than
  filters (e.g. a vector/embedding index for fuzzy term matching)? If so, `Repository`
  as a single generic interface may not be enough for dictionary — it might need its own
  `ConceptResolver` interface separate from plain CRUD storage.
- Where does adapter registration happen — a static import map, or true dynamic
  `require()`/plugin loading? Dynamic loading is more "one-size-fits-all" but adds startup
  complexity and a whole new failure class (missing dependency for an adapter no one uses
  yet).
- Should `storage.config.json` support per-environment overlays (dev/staging/prod), the
  way VS Code does user vs. workspace settings? Probably yes eventually, but worth deferring
  until there are ≥2 real adapters in use, not just the in-memory one.

## Filter State vs. Execution — Two Different Problems

Key realization: **filter state persistence and query execution are not the same
problem, and only one of them is actually "hard."**

- **Filter state** (checkpoints, version chain, saved views/dictionary entries) needs a
  real store so `filter_id`/`view_id` survive across sessions. This is small, structured,
  fully owned by the middleware — the `Repository` interface covers it, in-memory is fine
  for now, no backend-agnosticism drama needed here.
- **Query execution** (turning a compiled `QueryDefinition` into rows) is where "storage
  doesn't matter" really lives. In the limit, this can be as dumb as **POST the compiled
  query to a URL, get rows back** — an `HttpQueryEngine` implementing the same `QueryEngine`
  interface as `memory-engine.ts`/`sqlite-engine.ts`. No special-casing needed anywhere
  else in the stack once the interface is fixed.

**Filter middleware is not agent-specific.** Nothing about `FilterStore`, `add()`,
`combine()`, etc. assumes an LLM is calling it — a plain UI form producing
`{property, operator, value}` objects is an equally valid caller. The MCP tool layer is
just *one* adapter on top of this middleware, not something it depends on. Keep it that way;
don't let MCP-shaped assumptions (tool names, JSON schema validation) leak into `FilterStore`
itself.

**Corollary — combine/set-ops should stay client-side, not become a backend requirement.**
Since the resolver (`resolver.ts`, planned) already calls `engine.execute()` once per
sub-filter and does union/intersection/difference/symmetric-difference in JS, a remote
`HttpQueryEngine` backend never needs to understand set operations at all — it just needs
to answer "give me rows matching this flat filter." This keeps the wire contract minimal
and keeps any third-party backend author's integration surface small (one endpoint,
one job: filter → rows).

**Still needs to be resolved locally regardless of execution backend:**
- `filter.parameters()` schema discovery — either a sibling endpoint on the same API, or
  kept as local static config, independent of where row execution happens.
- Mock validation on `filter.add()` — should always hit a local fixture dataset via
  `memory-engine.ts`, never the real (possibly remote/paid/slow) execution backend, even
  when the tool's real `QueryEngine` is `HttpQueryEngine`. Otherwise "fast local validation,
  no backend calls" (a stated design goal) quietly breaks per-tool.

## Schema Discovery as a Config-Driven Resource Locator

Idea: `filter.parameters(tool_name)` schema shouldn't be hardcoded (current
`loader.ts` problem) — instead, a config file lists known tools and where their schema
comes from, tagged by a `_type` discriminator:

```jsonc
{
  "tools": {
    "browse_catalog": { "_type": "file", "path": "./config/tools/browse_catalog.json" },
    "medical_diagnosis": { "_type": "remote_url", "url": "https://internal-api/schema/medical_diagnosis" }
  }
}
```

A small resolver dispatches on `_type` (`file` → `fs.readFile`, `remote_url` → `fetch`)
and returns a validated `ToolSchema`. This is the **same discriminated resource-locator
pattern as the storage adapter selection** above (`storage.config.json`'s `"adapter": "sqlite"`
idea) — same mechanism, applied to schema sourcing instead of row storage/execution.
Worth building one generic `resolveSource(locator)` helper shared by both, rather than two
parallel implementations. `loader.ts` already does an ad hoc version of this
(`schemaPath` vs. `apiUrl` branches in `loadFilterConfig`) — formalizing with an explicit
`_type` tag instead of "whichever key happens to be present" is strictly better and easy
to retrofit.

**Caveats to bake in from the start:**
- `filter.parameters()` is supposed to be the fast, no-network discovery step (explicit
  spec benefit). `_type: remote_url` must be cached after first resolution, not fetched
  per call — otherwise "fast local validation" quietly becomes "network call every time
  someone discovers a tool's schema."
- **Pin the resolved schema onto the filter state at `filter.init()` time.** If the remote
  schema changes mid-chain (between `init()` and a later `add()`), validation would
  silently disagree with itself unless the schema snapshot is frozen at init.
- Whatever comes back — file or remote — still needs to conform to `ToolSchema`/
  `TableSchema` shape. Validate at the loader boundary (fail loud, at load time) rather
  than letting a malformed remote response surface as a confusing error deep inside
  `FilterStore.add()`.

## Backend Fidelity: What Survives the Move Off Postgres

`medical.sql` isn't really "the Postgres implementation" — it's a bundle of distinct
capabilities that happen to be expressed as Postgres features. Worth decomposing before
asking "can SQLite/IndexedDB/CSV/a vector DB do this too," since the answer is different
per capability:

1. Referential integrity (FKs, cascades)
2. Enum-constrained fields (`concept_translator_relation`, `expression_target_assignment`)
3. Temporal versioning (`concept_date_designation` + composite uniqueness)
4. Transitive closure caching (`concept_translator_cache`)
5. Many-to-many tagging (`expression_tags`/`expression_tag_matrix`)
6. Usage-weighted resolution counters (`expression_resolution_counters`)
7. i18n display strings (`concept_display_registry`)
8. **Exact/regex-based term matching** (`custom_expressions.regex_pattern`)

**Fidelity by backend:**

| Capability | SQLite | IndexedDB | CSV/JSONL | Vector DB |
|---|---|---|---|---|
| Referential integrity | native (FKs) | app-level only | app-level only | app-level only |
| Enums | `CHECK` constraint, not a real type | app-level validation | app-level validation | metadata field, app-validated |
| UUID gen | app-generated (`crypto.randomUUID()`), no server default | same | same | same |
| JSONB | `TEXT` + JSON1 functions | native (structured clone) | plain string | native metadata payload |
| Transitive closure cache | portable, or `WITH RECURSIVE` on demand | portable, JS-maintained | recomputed in memory, not persisted | **no native analog** — needs separate graph structure |
| Exact/regex term match | portable | portable | portable (linear scan) | **not native** — ANN is approximate, not exact-match |
| Usage-weighted scoring | portable | portable | portable, no atomic increment | must be blended into similarity score post-hoc |
| Concurrent mutation safety | native (WAL) | native (transactions) | **none** — needs append-only log framing, not mutable rows |

**Vector DB is not a drop-in `Repository` swap — it's a different `ConceptResolver`.**
This directly answers the earlier open question ("does dictionary's `resolve()` need a
genuinely different adapter shape than plain CRUD storage?"): yes. ANN similarity search
answers "what's semantically close," not "what pattern matched exactly" or "what's N hops
away in the relation graph" — those are different question types than a vector index can
serve. Realistic design: a **hybrid resolver** — try exact/regex match first (fast,
deterministic, cheap, current behavior), fall back to vector similarity only on a miss,
merge the two signal types the same way `priorityWeight + usageCount * 10` already blends
signals today. Treat `dictionary.resolve()`'s backend as pluggable the same way
`QueryEngine` is for filters, but expect the interface itself to need an extra method
(similarity search) that plain CRUD repositories don't have.

**CSV needs reframing, not just "another adapter."** Every CSV write is a full-file
rewrite — no safe partial update. It fits much better as an **append-only JSONL event
log** (one line per mutation, replay to reconstruct current state) than as a mutable
table, which conveniently matches the immutable-checkpoint pattern `FilterStore` already
uses for its own version chain. Don't force a CRUD `Repository` shape onto it.

**Note:** `medical.sql`'s context dimensions (`jurisdictions`, `facilities`,
`specialties`, `personnel`) are hardcoded FK columns — more rigid than the TS model's
generic `context?: Record<string, any>` bag on `CustomExpression`/`matchesContext()`.
Going topic-agnostic probably means the SQL schema should move *toward* the TS model's
flexibility (a generic key-value context table) rather than the TS model gaining more
fixed dimension columns to match SQL. Worth deciding which one is the source of truth
for shape.

## Audit: Actual Decoupling State (as of this writing)

Reality check against everything discussed above — how much of it is actually built
vs. still aspirational.

**Dictionary (`dictionary/index.ts`) — not decoupled, on three separate axes:**
- Storage: zero abstraction. `namespaces`/`concepts`/`relations`/`expressions`/`metrics`
  are plain class fields, touched directly in every method. No `Repository` interface,
  no injection point at all (contrast with `FilterStore.registerMockExecutor`).
- Resolution algorithm: baked directly into `resolve()` (regex compile, substring
  fallback, `priorityWeight + usageCount * 10` scoring) — no `ConceptResolver` seam to
  swap in a vector-based resolver without editing the store class itself.
- Schema vocabulary: mirrors `medical.sql` field-for-field (`targetAssignment:
  'MAIN_TERM'|'ATTRIBUTE_MODIFIER'|'BOTH'` etc.) — the generic `add/find/resolve/remove`
  facade from `stateful_tooling.md` doesn't exist yet.
- Fully synchronous throughout — no `async`, implicitly assumes in-memory.

**Filter (`filter/index.ts`) — state as coupled as dictionary, execution meaningfully
better:**
- State (`filters`/`modifiers`/`views`/`saved`/`schemas` Maps): same problem as
  dictionary — no `Repository` seam, synchronous, direct field access everywhere.
- Execution: `memory-engine.ts` is genuinely decoupled today — pure functions, only
  depends on shared types, no knowledge of `FilterStore`. `registerMockExecutor()`
  injects it as a closure rather than a direct import — a real, working seam, just
  informal (raw function type, not the `QueryEngine` interface) and global-only (one
  executor total, not per-tool/per-table).
- `sqlite-engine.ts` is decoupled in isolation (pure `compile()`, no driver) but **not
  wired to anything** — nothing calls it yet.
- `combine()` writes `{operation, ids}` but `getResolvedRules()` doesn't interpret it —
  combined filters aren't connected to execution at all yet (the planned `resolver.ts`
  doesn't exist). Not coupled or decoupled — just unbuilt.

**Bottom line:** `memory-engine.ts` + its injection point is the only piece of the
system with real, working decoupling today. Everything else (both stores' persistence,
dictionary's resolution strategy, `sqlite-engine.ts`'s integration, `combine()`'s
execution path) is still either tightly coupled or simply not connected. The
`Repository<T>` / `QueryEngine` / `ConceptResolver` interfaces discussed throughout this
doc are design targets, not current code.

## Clarification: Decoupled ≠ Always an API Call

Worth correcting explicitly, since it's an easy conflation: **decoupling means
programming against an interface, not against a transport.** "Every plugin is reached
via an HTTP call" is one possible adapter implementation, not a property of decoupling
itself.

What actually happens at runtime, in two distinct steps:

1. **Resolution happens once**, at config/boot time — the registry picks a concrete
   adapter for a given tool/table/store (`InMemoryRepository`, `SqliteEngine`,
   `HttpQueryEngine`, etc.), per `storage.config.json`.
2. **Every call after that is a normal method call** against whichever adapter got
   selected (`engine.execute(table, dataset, query)`). Whether that method does a
   `Map.get()`, a local SQLite call, or a `fetch()` is the adapter's own business —
   invisible to `FilterStore`/`DictionaryStore`.

`memory-engine.ts` is the existing proof of this: it's the most decoupled piece of the
system today, and it never leaves the process — zero network, zero serialization, just
a function reference resolved once via `registerMockExecutor()`.

Forcing everything through real API calls would actually **contradict two decisions
already in this doc**:
- Mock validation on `filter.add()` needs to stay fast/local — an always-HTTP design
  reintroduces a network round-trip per filter-building step, which was explicitly
  flagged as a regression risk earlier.
- `filter.parameters()` discovery needs to be cacheable, not re-fetched live per call.

Network calls belong specifically to adapters where the backend genuinely lives
elsewhere (remote Postgres, an external vector DB service, a hospital's existing API).
For anything in-process, the adapter resolves to a direct function call — that's not a
lesser form of decoupling, it's the same interface with a cheaper implementation behind
it. Keep the mental model as: **interface first, transport is a per-adapter detail, not
a system-wide requirement.**

## Zero-Code Setup: What Config Can and Can't Do

Concrete answer to "how would you deploy this without touching source, only config."

**Filter's three named pieces, each config-driven:**
- *State persistence* (`filter_state` in `storage.config.json`) — tool-agnostic, one
  adapter selection, since checkpoints aren't domain-specific.
- *Parameter search* (`filter.parameters()`) — per-tool `schema: { _type: file|remote_url, ... }`
  locator, per the resolver pattern already designed.
- *Validation* — a **separate** `validation_engine` per tool, deliberately defaulted to a
  cheap local adapter (`memory` + a small fixture file) regardless of what the tool's real
  `engine` is. This operationalizes the earlier rule that mock validation must stay fast/
  local even when production execution is remote.

New domain tool = new schema file + new fixture file + one block in `mcp.config.json`.
No source edits.

**Dictionary — the contract *is* the decoupling point.** Because `resolve`/`find`/`add`/
`remove` are a fixed interface, the backend behind `dictionary_backend.url` can be
arbitrarily simple (`medical.sql`-free stub, `SELECT ... LIKE`, no counters, flat
`score: 1.0`) or arbitrarily sophisticated (`medical.sql`-backed with Bayesian-weighted
auto-suggest via `expression_resolution_counters`) — swapping is a one-line URL change,
**provided every required field in the response contract has a trivially-producible
default.** The discipline: don't let any required field be something only the smart
implementation can compute (e.g. `score` must always be present — a naive backend just
hardcodes `1.0` — vs. making `score` conditionally present, which forces every caller to
branch on backend sophistication).

**Honest limits — two things still require source changes, by design, not oversight:**
1. **A brand-new adapter *type*** (first IndexedDB repo, first vector-DB resolver) must be
   written and registered once (`registerAdapter(name, impl)`). Config selects among
   already-registered adapters; it cannot invent a new transport from a string. This is a
   one-time framework contribution, not a per-deployment cost — every deployment after
   that reuses it via config only.
2. **A genuinely new computed-column/derivation pattern** in `memory-engine.ts` (beyond
   whatever `computed_columns` vocabulary already exists, e.g. `date_parts`, `explode`)
   needs a code addition — declarative config only covers operators it already knows.

**Summary:** config-only covers everything that varies *per deployment* (which tools,
which storage, which dictionary backend, which schema source). It does not eliminate
code for things that vary *per adapter type* — those are upstream, one-time additions
that every future deployment then gets for free.

## Filter Objects Belong in `find()`, Not `resolve()`

Question: since the dictionary's underlying data is tabular (concepts/expressions/
relations are just flat arrays of objects, same shape as any filter tool's dataset),
should structured filter-object querying live in `resolve()` or `find()`?

**Answer: `find()`.** The two operations are different *kinds* of read, not just two
entry points into the same data:

- `resolve(term)` is a **ranked decision**, not a structured query — pick the single best
  concept for a raw string. This is the swappable-algorithm seam (`ConceptResolver`):
  regex+weighted-scoring today, Bayesian counters via `medical.sql` tomorrow, vector
  similarity later. None of those backends can be expressed as `property = value`
  predicates — a vector backend's "nearest neighbor of an embedding" has no filter-object
  equivalent. Putting a `FilterCondition[]` into `resolve()`'s contract would couple the
  swappable ranking algorithm to a structured-query shape that a vector backend literally
  can't satisfy, undermining the exact seam `ConceptResolver` exists to protect.
- `find(query)` is already spec'd as the structured/exact-match discovery operation
  ("supports multiple query types" — keyword, tags, concept_type). This is precisely
  what a `FilterCondition[]` generalizes, and since the dictionary's tables are flat
  object arrays structurally identical to any filter tool's dataset, `find()` doesn't
  need bespoke predicate logic at all — it can be implemented as **the filter middleware
  pointed at the dictionary's own tables** (register `expressions`/`concepts` as tool
  tables with their own `TableSchema`, reuse `memory-engine.ts`/`FilterStore` directly).
  Deletes the current hand-rolled `.filter()` chain in `DictionaryStore.find()`.

**Resulting split:**
```
dictionary.find(query)   → structured filter over dictionary's own tables
                            (reuses filter/QueryEngine machinery — real code reuse, not
                            just architectural symmetry)
dictionary.resolve(term) → find() supplies candidates; a ConceptResolver-specific
                            ranking step on top picks the single best match
```

This also reframes current `DictionaryStore.resolve()` correctly — it already does
"gather candidates, then score and sort" inline; the refactor is separating "gather
candidates" (→ `find()`, generic) from "rank them" (→ stays inside the swappable
resolver), rather than treating resolution as one monolithic algorithm.

## Next Steps (tentative)

6. Refactor `dictionary.find()` to delegate to `FilterStore`/`memory-engine.ts` against
   dictionary tables registered as tool tables, instead of its current hand-rolled
   predicate chain — do this before building `resolve()`'s candidate+rank split, since
   `resolve()` depends on `find()` for candidate generation once split out.

1. Define `Repository<T>` and `QueryEngine` interfaces (carried over from prior discussion).
2. Ship exactly one adapter (`InMemoryRepository`) implementing them — prove the interface
   shape before building the config/registry layer around it.
3. Build the adapter registry (`registerAdapter(name, factory)`) + config loader as a
   separate concern from #1/#2, so the interface isn't accidentally designed around one
   config format.
4. Only then write `storage.config.json` support and a second adapter (SQLite is the
   natural second choice — `sqlite-engine.ts` already exists for compilation).
5. Define the `ConceptResolverResult` contract explicitly (required vs. optional fields,
   naive-backend defaults) before building any second dictionary backend — this is the
   piece that makes dictionary swappability actually work, per the section above.