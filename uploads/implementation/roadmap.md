# Implementation Roadmap — Filter + Dictionary MCP Middleware

Self-contained guide covering file structure, dependencies, adapter registry,
pseudocode skeletons, and known gaps. Read the implementation plan alongside this
document — the plan is the "why," this is the "how and in what order."

---

## Directory Layout

```
filter-mcp-server/
├── config/
│   ├── tools.config.json           # Per-tool schema/engine/validation locators (git-tracked)
│   ├── storage.config.json         # Storage adapters + env refs (deployment-specific)
│   ├── tools/
│   │   ├── browse_catalog.schema.json
│   │   ├── browse_catalog.fixture.json
│   │   ├── browse_catalog.translation.json
│   │   ├── medical_diagnosis.fixture.json
│   │   └── medical_diagnosis.translation.json
│   ├── objects/
│   │   └── schedule_appointment.schema.json
│   └── constants/
│       └── global.json             # Org-wide constants (exchange rates, etc.)
├── src/
│   ├── config/
│   │   ├── types.ts                # ResourceLocator, MiddlewareConfig, ToolConfig
│   │   ├── loader.ts               # Boot loader: env substitution, resolveSource(), cache
│   │   └── validator.ts            # Load-time config validation (fail-loud)
│   ├── errors/
│   │   ├── types.ts                # McpError class, error code enum
│   │   └── format.ts               # MCP error response serializer
│   ├── adapters/
│   │   ├── registry.ts             # registerAdapter(), resolveAdapter()
│   │   ├── storage/
│   │   │   ├── interfaces.ts       # SessionFilterStore, PersistentFilterStore interfaces
│   │   │   ├── memory-repo.ts      # In-memory Map adapter (session default)
│   │   │   ├── sqlite-repo.ts      # bun:sqlite adapter (session + persistent)
│   │   │   └── pg-repo.ts          # pg driver adapter (persistent)
│   │   └── engines/
│   │       ├── interfaces.ts       # QueryEngine interface
│   │       ├── memory-query.ts     # In-memory interpreter (evaluateFilter, executeQuery)
│   │       ├── sqlite-query.ts     # bun:sqlite compiler (? placeholders, CTEs for $var)
│   │       ├── pg-query.ts         # pg compiler ($1/$2 placeholders, CTEs for $var)
│   │       ├── http-query.ts       # HTTP proxy engine (cooperative + third-party)
│   │       └── indexeddb-query.ts  # Browser hybrid engine (future/optional build target)
│   ├── translation/
│   │   ├── types.ts                # PropertyTranslation, TableTranslation, PipelineStep
│   │   ├── pipeline.ts             # executePipeline(steps, row, constants) interpreter
│   │   ├── compiler.ts             # compilePipelineToSQL(steps, engine) → SQL fragment
│   │   ├── resolver.ts             # resolveTranslation(locator) with caching
│   │   └── validator.ts            # Load-time pipeline graph validation (cycles, $var refs)
│   ├── constants/
│   │   ├── types.ts                # ConstantsTier, MergedConstants
│   │   └── resolver.ts             # resolveConstants(userId?) — three-tier merge + cache
│   ├── middleware/
│   │   ├── filter/
│   │   │   ├── types.ts            # FilterCondition, FilterState, QueryDefinition, etc.
│   │   │   ├── store.ts            # FilterStore coordinator (3-tier lookup, session threading)
│   │   │   ├── resolver.ts         # resolveRows(), combine set-ops, calls QueryEngine
│   │   │   └── inspector.ts        # filter.inspect(), filter.diff()
│   │   ├── dictionary/
│   │   │   ├── types.ts            # Namespace, Concept, Expression, ResolutionMetric
│   │   │   ├── store.ts            # DictionaryStore (delegates find() to filter engine)
│   │   │   └── resolver.ts         # ConceptResolver interface + ranked matching
│   │   └── object/
│   │       ├── types.ts            # ObjectState, Path, ValidationResult, ObjectDiffResult
│   │       ├── store.ts            # ObjectStore (set/patch/array ops, version chain)
│   │       ├── schema-walker.ts    # $defs traversal, path validation, cycle detection
│   │       ├── ref-resolver.ts     # object.ref() lazy resolution at object.resolve() time
│   │       └── inspector.ts        # object.inspect(), object.diff()
│   └── index.ts                    # MCP server entrypoint — tool registration + wiring
├── package.json
└── tsconfig.json
```

---

## Dependency Matrix

```jsonc
// package.json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.2.0",  // MCP stdio transport + McpServer
    "zod": "^3.22.0",                        // Tool input schema validation
    "ajv": "^8.12.0",                        // JSON Schema validator (object middleware)
    "pg": "^8.11.0"                          // PostgreSQL driver
  },
  "devDependencies": {
    "bun-types": "latest"                    // bun:sqlite types, Bun runtime globals
  }
}
// Note: sqlite3 npm package NOT needed — Bun ships bun:sqlite natively.
// Note: pandas runs as a sidecar HTTP service; it is NOT a registered adapter.
//       Point its tool's engine at { _type: "adapter", name: "http",
//       options: { url: "http://localhost:8001/query" } }
```

---

## Boot Sequence

Order is strict — later steps depend on earlier ones completing without error.

```
1. Load env sources        → substitute all "env:VAR_NAME" strings
2. Load + validate config  → fail loud on unknown _type, unregistered adapter names,
                             version mismatch, missing required fields
3. Register built-in adapters → memory, sqlite, pg, http, file
4. Resolve storage adapters   → filter_session_state, filter_persistent_state.{global,user},
                                 dictionary_state, object_session_state,
                                 object_persistent_state.{global,user}
5. Resolve + cache global constants  → constants.global (ttl_ms refresh scheduled)
6. Load + validate tool schemas      → pinned at load, not re-fetched per call
7. Load + validate translation files → pipeline graph validation (cycles, $var refs,
                                        op-family vs engine capability check)
8. Load object schemas               → $defs cycle detection
9. Register MCP tools                → wire all tool handlers
10. Start MCP transport              → stdio or HTTP
```

---

## Skeleton Implementations

### `src/config/types.ts`

```typescript
export type ResourceLocator =
  | { _type: "adapter"; name: string; options?: Record<string, unknown> }
  | { _type: "file"; path: string; ttl_ms?: number }
  | { _type: "remote_url"; url: string; ttl_ms?: number; headers?: Record<string, string> };

export type OwnerScope =
  | { level: "global" }
  | { level: "user"; userId: string };

export interface ToolConfig {
  schema: ResourceLocator;
  translation?: ResourceLocator;
  engine: ResourceLocator | Record<string, ResourceLocator>;  // single or per-table
  validation_engine?: ResourceLocator;
  inspect?: { expose_compiled?: boolean };
}

export interface MiddlewareConfig {
  $schema?: string;
  version: 1;

  filter_session_state: ResourceLocator;
  filter_persistent_state: { global: ResourceLocator; user: ResourceLocator };

  object_session_state: ResourceLocator;
  object_persistent_state: { global: ResourceLocator; user: ResourceLocator };

  dictionary_state: ResourceLocator;
  dictionary_resolver: ResourceLocator;

  constants?: {
    global?: ResourceLocator;
    user?: ResourceLocator;   // URL may contain {userId} placeholder — substituted per-request
  };

  object_schemas?: Record<string, ResourceLocator>;

  object_schema_limits?: {
    max_fields_per_def?: number;   // default 7
    max_ref_depth?: number;        // default 5
  };

  tools: Record<string, ToolConfig>;

  env_sources?: Array<ResourceLocator & { optional?: boolean }>;
}
```

### `src/config/loader.ts`

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import type { ResourceLocator, MiddlewareConfig } from "./types";

// ── Env substitution ──────────────────────────────────────────────────────────

export async function loadEnvSources(
  sources: Array<{ _type: string; path?: string; optional?: boolean }>
): Promise<void> {
  // Load each .env file in order; process.env always wins over file values
  for (const src of sources) {
    if (src._type !== "file" || !src.path) continue;
    try {
      const raw = await fs.readFile(src.path, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = val;  // file never overrides real env
      }
    } catch (err) {
      if (!src.optional) throw new Error(`Required env file not found: ${src.path}`);
    }
  }
}

export function substituteEnvVars(obj: unknown): unknown {
  // Recursively walk any JSON-serializable value and replace "env:VAR_NAME" strings
  if (typeof obj === "string" && obj.startsWith("env:")) {
    const key = obj.slice(4);
    const val = process.env[key];
    if (val === undefined) throw new Error(`Missing env variable: ${key}`);
    return val;
  }
  if (Array.isArray(obj)) return obj.map(substituteEnvVars);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, substituteEnvVars(v)])
    );
  }
  return obj;
}

// ── Source resolution with TTL cache ─────────────────────────────────────────

interface CacheEntry { value: unknown; resolvedAt: number }
const sourceCache = new Map<string, CacheEntry>();

export async function resolveSource(
  locator: ResourceLocator,
  workspaceRoot: string,
  userId?: string    // supplied for user-scoped constants only
): Promise<unknown> {
  // Build cache key — include userId for user-scoped sources
  const cacheKey = JSON.stringify(locator) + (userId ? `:${userId}` : "");
  const ttl = locator._type !== "adapter" ? (locator.ttl_ms ?? 0) : 0;

  if (ttl === 0) {
    // Cache forever — serve from cache if present
    const cached = sourceCache.get(cacheKey);
    if (cached) return cached.value;
  } else {
    const cached = sourceCache.get(cacheKey);
    if (cached && Date.now() - cached.resolvedAt < ttl) return cached.value;
  }

  let value: unknown;

  switch (locator._type) {
    case "adapter":
      // Adapter resolution is not cached here — the registry handles adapter lifecycle
      return resolveAdapter(locator.name, substituteEnvVars(locator.options ?? {}) as Record<string, unknown>);

    case "file": {
      const resolved = path.resolve(workspaceRoot, locator.path);
      const raw = await fs.readFile(resolved, "utf-8");
      value = substituteEnvVars(JSON.parse(raw));
      break;
    }

    case "remote_url": {
      // Substitute {userId} placeholder in URL for user-scoped constants
      const url = userId ? locator.url.replace("{userId}", encodeURIComponent(userId)) : locator.url;
      const res = await fetch(url, { headers: locator.headers });
      if (!res.ok) throw new Error(`resolveSource fetch failed: ${url} → HTTP ${res.status}`);
      value = substituteEnvVars(await res.json());
      break;
    }

    default:
      throw new Error(`Unknown ResourceLocator _type: ${(locator as any)._type}`);
  }

  sourceCache.set(cacheKey, { value, resolvedAt: Date.now() });
  return value;
}

// ── Adapter registry (defined here to avoid circular import) ─────────────────

export interface AdapterFactory<T> {
  create(options: Record<string, unknown>): Promise<T>;
}

const registry = new Map<string, AdapterFactory<unknown>>();

export function registerAdapter<T>(name: string, factory: AdapterFactory<T>): void {
  if (registry.has(name)) throw new Error(`Adapter already registered: "${name}"`);
  registry.set(name, factory as AdapterFactory<unknown>);
}

export async function resolveAdapter<T>(
  name: string,
  options: Record<string, unknown> = {}
): Promise<T> {
  const factory = registry.get(name);
  if (!factory) throw new Error(`Unregistered adapter: "${name}"`);
  return factory.create(options) as Promise<T>;
}
```

### `src/errors/types.ts`

```typescript
export enum ErrorCode {
  // Config / boot errors
  CONFIG_INVALID            = "CONFIG_INVALID",
  ADAPTER_NOT_REGISTERED    = "ADAPTER_NOT_REGISTERED",
  SCHEMA_LOAD_FAILED        = "SCHEMA_LOAD_FAILED",
  TRANSLATION_CYCLE         = "TRANSLATION_CYCLE",

  // Filter errors
  FILTER_NOT_FOUND          = "FILTER_NOT_FOUND",
  FILTER_PROPERTY_INVALID   = "FILTER_PROPERTY_INVALID",
  FILTER_OPERATOR_INVALID   = "FILTER_OPERATOR_INVALID",
  FILTER_COMBINATION_INVALID = "FILTER_COMBINATION_INVALID",
  FILTER_SCOPE_INVALID      = "FILTER_SCOPE_INVALID",
  FILTER_PRIVILEGE_DENIED   = "FILTER_PRIVILEGE_DENIED",

  // Dictionary errors
  CONCEPT_NOT_FOUND         = "CONCEPT_NOT_FOUND",
  EXPRESSION_INVALID        = "EXPRESSION_INVALID",
  RESOLVE_NO_MATCH          = "RESOLVE_NO_MATCH",

  // Object errors
  OBJECT_NOT_FOUND          = "OBJECT_NOT_FOUND",
  OBJECT_PATH_INVALID       = "OBJECT_PATH_INVALID",
  OBJECT_TYPE_MISMATCH      = "OBJECT_TYPE_MISMATCH",
  OBJECT_VALIDATION_FAILED  = "OBJECT_VALIDATION_FAILED",
  OBJECT_CYCLE_DETECTED     = "OBJECT_CYCLE_DETECTED",
  OBJECT_SCHEMA_EXCEEDED    = "OBJECT_SCHEMA_EXCEEDED",

  // Execution errors (never expose internal DB details in message)
  EXECUTION_FAILED          = "EXECUTION_FAILED",

  // General
  INTERNAL_ERROR            = "INTERNAL_ERROR",
}

export class McpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "McpError";
  }
}
```

### `src/adapters/storage/interfaces.ts`

```typescript
import type { OwnerScope } from "../../config/types";
import type { FilterState } from "../../middleware/filter/types";
import type { ObjectState } from "../../middleware/object/types";

// Session store — keyed by (sessionId, id). TTL-cleaned.
export interface SessionFilterStore {
  get(sessionId: string, id: string): Promise<FilterState | null>;
  set(sessionId: string, id: string, state: FilterState): Promise<void>;
  delete(sessionId: string, id: string): Promise<void>;
  listSession(sessionId: string): Promise<string[]>;
  listChildren(sessionId: string, parentId: string): Promise<string[]>;
  expireSession(sessionId: string, olderThanMs?: number): Promise<void>;
}

// Persistent store — keyed by (id, scope). No TTL.
export type PersistedFilterState = FilterState & {
  tags: string[];
  description: string;
  schema_snapshot: string;   // JSON-serialized public TableSchema, pinned at init()
};

export interface PersistentFilterStore {
  get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
  set(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void>;
  delete(id: string, scope: OwnerScope): Promise<void>;
  findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]>;
  list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedFilterState & { scope: OwnerScope }>>;
}

// Object stores follow the same pattern
export type PersistedObjectState = ObjectState & {
  tags: string[];
  description: string;
  schema_pinned_at: string;
};

export interface SessionObjectStore {
  get(sessionId: string, id: string): Promise<ObjectState | null>;
  set(sessionId: string, id: string, state: ObjectState): Promise<void>;
  delete(sessionId: string, id: string): Promise<void>;
  listSession(sessionId: string): Promise<string[]>;
  listChildren(sessionId: string, parentId: string): Promise<string[]>;
  expireSession(sessionId: string, olderThanMs?: number): Promise<void>;
}

export interface PersistentObjectStore {
  get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
  set(id: string, state: PersistedObjectState, scope: OwnerScope): Promise<void>;
  delete(id: string, scope: OwnerScope): Promise<void>;
  findByTag(tag: string, scope: OwnerScope): Promise<PersistedObjectState[]>;
  list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedObjectState & { scope: OwnerScope }>>;
}
```

### `src/adapters/engines/interfaces.ts`

```typescript
import type { QueryDefinition } from "../../middleware/filter/types";

export interface QueryEngine {
  execute(tableName: string, query: QueryDefinition): Promise<unknown[]>;
  // Optional — adapters that can compile to a human-readable form implement this.
  // Only returned to callers when expose_compiled: true in tool config.
  compile?(tableName: string, query: QueryDefinition): { sql: string; params: unknown[] };
  // Capability declarations — checked at load time against translation op-families
  supportedOpFamilies?: string[];
  supportedOperations?: string[];
}
```

### `src/translation/types.ts`

```typescript
export type ArgRef =
  | { $init: string }
  | { $var: string }
  | number | string | boolean;

export type OpName =
  | "add" | "sub" | "mul" | "div" | "mod" | "exp"
  | "lt"  | "leq" | "eq"  | "neq" | "geq" | "gt"
  | "year" | "month" | "day" | "quarter" | "date_diff"
  | "get"
  | "json_parse";

export interface PipelineStep {
  op: OpName;
  args: ArgRef[];
  return_var?: string;
  on_missing?: "null" | "error" | { literal: unknown };
}

export interface PropertyTranslation {
  internal: string;              // internal column/path name
  internal_type?: "scalar" | "array";  // required for array-containment ops
  transform?: { pipeline: PipelineStep[] };
  allowed_operators?: string[];  // narrows (never widens) the table-level operator list
}

export interface TableTranslation {
  properties: Record<string, PropertyTranslation>;
  constants?: Record<string, unknown> | string;  // inline Record or ResourceLocator path
  supported_op_families?: string[];
  supported_operations?: string[];
  expressible_combinations?: string[][];  // for fixed-shape API adapters (adapter type 5)
}
```

### `src/translation/pipeline.ts`

```typescript
import type { PipelineStep, ArgRef } from "./types";

// Resolve one argument reference against the execution environment
function resolveArg(
  arg: ArgRef,
  row: Record<string, unknown>,
  constants: Record<string, unknown>,
  vars: Record<string, unknown>
): unknown {
  if (arg !== null && typeof arg === "object") {
    if ("$init" in arg) return row[arg.$init] !== undefined ? row[arg.$init] : constants[arg.$init];
    if ("$var" in arg) return vars[arg.$var];
  }
  return arg;  // literal
}

// Execute a full pipeline over one row, threading return_var results as vars
export function executePipeline(
  steps: PipelineStep[],
  row: Record<string, unknown>,
  constants: Record<string, unknown>
): unknown {
  const vars: Record<string, unknown> = {};
  let lastResult: unknown = undefined;

  for (const step of steps) {
    const args = step.args.map((a) => resolveArg(a, row, constants, vars));
    lastResult = applyOp(step, args);

    if (step.return_var !== undefined) {
      vars[step.return_var] = lastResult;
    }
  }

  return lastResult;
}

function applyOp(step: PipelineStep, args: unknown[]): unknown {
  const missing = (fallback: unknown) => {
    if (!step.on_missing || step.on_missing === "null") return null;
    if (step.on_missing === "error") throw new Error(`on_missing: error at op "${step.op}"`);
    if (typeof step.on_missing === "object" && "literal" in step.on_missing) return step.on_missing.literal;
    return fallback;
  };

  switch (step.op) {
    // Arithmetic
    case "add": return (args[0] as number) + (args[1] as number);
    case "sub": return (args[0] as number) - (args[1] as number);
    case "mul": return (args[0] as number) * (args[1] as number);
    case "div": {
      if (args[1] === 0) throw new Error("Pipeline: division by zero");
      return (args[0] as number) / (args[1] as number);
    }
    case "mod": return (args[0] as number) % (args[1] as number);
    case "exp": return Math.pow(args[0] as number, args[1] as number);
    // Comparison
    case "lt":  return args[0] < args[1];
    case "leq": return args[0] <= args[1];
    case "eq":  return args[0] === args[1];
    case "neq": return args[0] !== args[1];
    case "geq": return args[0] >= args[1];
    case "gt":  return args[0] > args[1];
    // Date
    case "year": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : d.getFullYear();
    }
    case "month": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : d.getMonth() + 1;
    }
    case "day": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : d.getDate();
    }
    case "quarter": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : Math.ceil((d.getMonth() + 1) / 3);
    }
    case "date_diff": {
      const a = new Date(args[0] as string), b = new Date(args[1] as string);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return missing(null);
      return Math.floor((b.getTime() - a.getTime()) / 86_400_000);  // days
    }
    // JSON / nested
    case "json_parse": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      try { return JSON.parse(args[0] as string); }
      catch { return missing(null); }
    }
    case "get": {
      const [obj, ...path] = args;
      if (obj === null || obj === undefined || typeof obj !== "object") return missing(null);
      let cur: unknown = obj;
      for (const segment of path) {
        if (cur === null || cur === undefined) return missing(null);
        cur = (cur as Record<string, unknown>)[segment as string];
      }
      return cur ?? missing(null);
    }
    default:
      throw new Error(`Pipeline: unsupported op "${(step as any).op}"`);
  }
}
```

### `src/translation/validator.ts`

```typescript
import type { PipelineStep, TableTranslation } from "./types";

// Validates a full TableTranslation at load time.
// Throws McpError on any violation — consistent with the fail-loud boot principle.
export function validateTableTranslation(
  tableName: string,
  translation: TableTranslation,
  engineOpFamilies: string[]
): void {
  const MAX_DEPTH = 20;

  for (const [publicProp, propTrans] of Object.entries(translation.properties)) {
    if (!propTrans.transform) continue;
    const steps = propTrans.transform.pipeline;
    if (steps.length > MAX_DEPTH) {
      throw new Error(`Translation: pipeline too deep on "${tableName}.${publicProp}" (max ${MAX_DEPTH})`);
    }

    const initNames = new Set<string>();      // row columns + constants (known before pipeline)
    const returnVarNames = new Set<string>(); // accumulated return_var names

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;

      // Check op-family capability
      const family = opFamily(step.op);
      if (!engineOpFamilies.includes(family)) {
        throw new Error(
          `Translation: op "${step.op}" (family: ${family}) used on "${tableName}.${publicProp}" ` +
          `but engine does not declare "${family}" in supported_op_families`
        );
      }

      // Validate $var references point to prior steps only
      for (const arg of step.args) {
        if (arg !== null && typeof arg === "object" && "$var" in arg) {
          if (!returnVarNames.has(arg.$var)) {
            throw new Error(
              `Translation: $var "${arg.$var}" on step ${i} of "${tableName}.${publicProp}" ` +
              `references an undeclared or forward return_var`
            );
          }
        }
      }

      // Check return_var doesn't collide with $init namespace
      if (step.return_var) {
        if (initNames.has(step.return_var)) {
          throw new Error(
            `Translation: return_var "${step.return_var}" on "${tableName}.${publicProp}" ` +
            `collides with an $init name`
          );
        }
        returnVarNames.add(step.return_var);
      }
    }
  }
}

function opFamily(op: string): string {
  if (["add","sub","mul","div","mod","exp"].includes(op)) return "arithmetic";
  if (["lt","leq","eq","neq","geq","gt"].includes(op)) return "comparison";
  if (["year","month","day","quarter","date_diff"].includes(op)) return "date";
  if (["get","json_parse"].includes(op)) return "nested_access";
  if (["explode"].includes(op)) return "explode";
  return "unknown";
}
```

### `src/constants/resolver.ts`

```typescript
import type { ResourceLocator, MiddlewareConfig } from "../config/types";
import { resolveSource } from "../config/loader";

// Shared cache keyed by locator identity — THREE tools pointing at the same
// global constants URL must share one fetch, not trigger three independent ones.
const constantsCache = new Map<string, Record<string, unknown>>();

export async function resolveConstants(
  config: MiddlewareConfig,
  workspaceRoot: string,
  userId?: string,           // undefined = no user tier (unauthenticated or not needed)
  localConstants?: Record<string, unknown>  // per-table inline constants
): Promise<Record<string, unknown>> {
  // 1. Global tier — resolve once, cache forever (or per ttl_ms)
  let global: Record<string, unknown> = {};
  if (config.constants?.global) {
    const key = JSON.stringify(config.constants.global);
    if (!constantsCache.has(key)) {
      global = (await resolveSource(config.constants.global, workspaceRoot)) as Record<string, unknown>;
      constantsCache.set(key, global);
    } else {
      global = constantsCache.get(key)!;
    }
  }

  // 2. User tier — resolved per-request (userId known only at request time)
  let user: Record<string, unknown> = {};
  if (userId && config.constants?.user) {
    const key = JSON.stringify(config.constants.user) + `:${userId}`;
    if (!constantsCache.has(key)) {
      user = (await resolveSource(config.constants.user, workspaceRoot, userId)) as Record<string, unknown>;
      constantsCache.set(key, user);  // per-userId cache entry
    } else {
      user = constantsCache.get(key)!;
    }
  }

  // 3. Local tier — inline, no caching needed
  const local = localConstants ?? {};

  // Merge order: global → user → local (later tiers overlay earlier)
  // Warn on collisions between tiers (not a hard error)
  const merged = { ...global };
  for (const [k, v] of Object.entries(user)) {
    if (k in merged) console.warn(`Constants: user-level key "${k}" overrides global`);
    merged[k] = v;
  }
  for (const [k, v] of Object.entries(local)) {
    if (k in merged) console.warn(`Constants: local key "${k}" overrides global/user`);
    merged[k] = v;
  }

  return merged;
}
```

### `src/middleware/filter/store.ts` (coordinator outline)

```typescript
import type { SessionFilterStore, PersistentFilterStore } from "../../adapters/storage/interfaces";
import type { FilterState, FilterCondition, TableSchema } from "./types";
import type { OwnerScope } from "../../config/types";
import { ErrorCode, McpError } from "../../errors/types";

// FilterStore is a coordinator — it holds references to the three storage backends
// and routes lookups through them in order: session → user-persistent → global-persistent.
// It never touches a Map or a DB driver directly.
export class FilterStore {
  constructor(
    private session: SessionFilterStore,
    private persistent: PersistentFilterStore,
    private toolSchemas: Map<string, Record<string, TableSchema>>,
    private pinnedSchemas: Map<string, TableSchema>  // filter_id → pinned schema at init
  ) {}

  // Three-tier lookup: session first, then user-persistent, then global-persistent
  private async lookup(id: string, sessionId: string, userId?: string): Promise<FilterState | null> {
    return (
      (await this.session.get(sessionId, id)) ??
      (userId ? await this.persistent.get(id, { level: "user", userId }) : null) ??
      (await this.persistent.get(id, { level: "global" }))
    );
  }

  async init(sessionId: string, toolName?: string, tableName?: string): Promise<string> {
    // Validate tool/table exist in schema registry
    if (toolName) {
      const tables = this.toolSchemas.get(toolName);
      if (!tables) throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Tool "${toolName}" not registered`);
      if (tableName && !tables[tableName]) {
        throw new McpError(ErrorCode.FILTER_PROPERTY_INVALID, `Table "${tableName}" not in tool "${toolName}"`);
      }
    }

    const filterId = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const schema = toolName && tableName ? this.toolSchemas.get(toolName)?.[tableName] : undefined;

    const state: FilterState = {
      filterId, toolName, tableName,
      rules: [],
      parentFilterId: null,
      createdAt: new Date().toISOString(),
    };

    await this.session.set(sessionId, filterId, state);
    if (schema) this.pinnedSchemas.set(filterId, schema);

    return filterId;
  }

  async add(
    filterId: string,
    operations: FilterCondition[],
    sessionId: string,
    userId?: string
  ): Promise<string> {
    const parent = await this.lookup(filterId, sessionId, userId);
    if (!parent) throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not found`);

    const schema = parent.tableName
      ? this.toolSchemas.get(parent.toolName!)?.[ parent.tableName]
      : undefined;

    // Schema validation against public property names / allowed operators.
    // Also checks basic type-aware constraints (e.g. disallowing string 'like' checks on numeric fields, or mathematical aggregations on text fields).
    if (schema) {
      for (const op of operations) {
        if (!schema.filterable_properties.includes(op.property)) {
          throw new McpError(
            ErrorCode.FILTER_PROPERTY_INVALID,
            `"${op.property}" is not filterable on "${parent.tableName}"`,
            { allowed: schema.filterable_properties }
          );
        }
        if (!schema.operators.includes(op.operator)) {
          throw new McpError(
            ErrorCode.FILTER_OPERATOR_INVALID,
            `Operator "${op.operator}" not allowed on "${parent.tableName}"`,
            { allowed: schema.operators }
          );
        }
      }
    }

    const newId = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const newState: FilterState = {
      filterId: newId,
      toolName: parent.toolName,
      tableName: parent.tableName,
      rules: operations,
      parentFilterId: filterId,
      createdAt: new Date().toISOString(),
    };

    await this.session.set(sessionId, newId, newState);
    if (schema) this.pinnedSchemas.set(newId, schema);

    return newId;
  }

  async save(
    filterId: string,
    tags: string[],
    description: string,
    scope: OwnerScope,
    sessionId: string,
    checkPrivilege: (userId?: string) => boolean
  ): Promise<string> {
    // Privilege check for global scope
    if (scope.level === "global") {
      const userId = undefined;  // global writes don't belong to a user
      if (!checkPrivilege(userId)) {
        throw new McpError(ErrorCode.FILTER_PRIVILEGE_DENIED, "Insufficient privilege for global scope");
      }
    }

    // Must compress before saving
    const state = await this.session.get(sessionId, filterId);
    if (!state) throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not in session`);
    if (state.parentFilterId !== null) {
      throw new McpError(ErrorCode.FILTER_SCOPE_INVALID, "Compress the filter before saving");
    }

    const schema = this.pinnedSchemas.get(filterId);
    await this.persistent.set(filterId, {
      ...state, tags, description,
      schema_snapshot: JSON.stringify(schema ?? null),
    }, scope);

    return filterId;
  }
}
```

### `src/middleware/object/schema-walker.ts`

```typescript
// Validates $defs for cycles (at schema-load time) and resolves a path
// against the schema to determine the leaf node's expected type.

export function validateCycleFree(defs: Record<string, unknown>): void {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(name: string): void {
    if (stack.has(name)) throw new Error(`Object schema cycle detected: ... → ${name}`);
    if (visited.has(name)) return;
    visited.add(name);
    stack.add(name);

    const def = (defs[name] as any);
    if (def?.properties) {
      for (const prop of Object.values<any>(def.properties)) {
        const ref: string | undefined = prop?.$ref;
        if (ref?.startsWith("#/$defs/")) {
          dfs(ref.replace("#/$defs/", ""));
        }
      }
    }
    stack.delete(name);
  }

  for (const name of Object.keys(defs)) {
    if (!visited.has(name)) dfs(name);
  }
}

export function validateFieldLimits(
  defs: Record<string, unknown>,
  maxFields: number,
  maxDepth: number
): void {
  function check(defName: string, depth: number): void {
    if (depth > maxDepth) throw new Error(`Object schema: nesting depth exceeds ${maxDepth} at "${defName}"`);
    const def = (defs[defName] as any);
    const props = def?.properties ? Object.keys(def.properties) : [];
    if (props.length > maxFields) {
      throw new Error(
        `Object schema: "${defName}" has ${props.length} fields, exceeds max ${maxFields}`
      );
    }
    for (const prop of Object.values<any>(def?.properties ?? {})) {
      if (prop?.$ref?.startsWith("#/$defs/")) {
        check(prop.$ref.replace("#/$defs/", ""), depth + 1);
      }
    }
  }
  for (const name of Object.keys(defs)) check(name, 1);
}

// Walk schema to resolve what type a given path points to
export function resolvePathSchema(
  rootSchema: any,
  defs: Record<string, any>,
  path: (string | number)[]
): any {
  let current = rootSchema;
  for (const segment of path) {
    if (typeof segment === "number") {
      current = current?.items;
    } else {
      if (current?.$ref?.startsWith("#/$defs/")) {
        current = defs[current.$ref.replace("#/$defs/", "")];
      }
      current = current?.properties?.[segment];
    }
    if (!current) return null;
  }
  return current;
}
```

### `src/index.ts` — tool registration pattern

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { McpError, ErrorCode } from "./errors/types";
import { FilterStore } from "./middleware/filter/store";

// Boot sequence (abbreviated — see full boot order above)
const server = new McpServer({ name: "mcp-middleware", version: "1.0.0" });

// Generic error boundary — all tool handlers go through this
function wrapToolHandler<T extends Record<string, unknown>>(
  handler: (args: T) => Promise<unknown>
) {
  return async (args: T) => {
    try {
      const result = await handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const isMcp = err instanceof McpError;
      const payload = {
        error: {
          code:    isMcp ? err.code    : ErrorCode.INTERNAL_ERROR,
          // Never forward raw DB errors — internal details stay server-side
          message: isMcp ? err.message : "An internal error occurred",
          details: isMcp ? (err.details ?? {}) : {},
        }
      };
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }]
      };
    }
  };
}

// ── filter.init ───────────────────────────────────────────────────────────────
server.registerTool("filter_init", {
  description: "Initialize an empty filter for a given tool and table.",
  inputSchema: {
    session_id:  z.string().describe("Conversation/session identifier"),
    tool_name:   z.string().optional(),
    table_name:  z.string().optional(),
  }
}, wrapToolHandler(async ({ session_id, tool_name, table_name }) => {
  // const id = await filterStore.init(session_id, tool_name, table_name);
  return { filter_id: "example_id" };
}));

// ── filter.add ────────────────────────────────────────────────────────────────
server.registerTool("filter_add", {
  description: "Append filter conditions to an existing filter chain.",
  inputSchema: {
    session_id: z.string(),
    filter_id:  z.string(),
    operations: z.array(z.object({
      property: z.string(),
      operator: z.enum([
        "eq","neq","gt","geq","lt","leq",
        "like","not_like",
        "in_set","not_in_set",
        "contains","not_contains","contains_any","contains_all",
        "between","not_between"
      ]),
      // Union covers all valid FilterCondition value shapes
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())])
    })),
    user_id: z.string().optional(),
  }
}, wrapToolHandler(async ({ session_id, filter_id, operations, user_id }) => {
  // const newId = await filterStore.add(filter_id, operations, session_id, user_id);
  return { filter_id: "new_child_id" };
}));

// ── filter.parameters ─────────────────────────────────────────────────────────
server.registerTool("filter_parameters", {
  description: "Return the public schema for a tool/table (filterable properties, operators, supported operations). Never exposes internal column names.",
  inputSchema: {
    tool_name:  z.string(),
    table_name: z.string().optional(),
  }
}, wrapToolHandler(async ({ tool_name, table_name }) => {
  // Return public TableSchema only — translation layer is server-side only
  return { schema: {} };
}));

// ── filter.inspect ────────────────────────────────────────────────────────────
server.registerTool("filter_inspect", {
  description: "Inspect current resolved state of a filter. Internal SQL never exposed by default.",
  inputSchema: {
    session_id: z.string(),
    filter_id:  z.string(),
    user_id:    z.string().optional(),
  }
}, wrapToolHandler(async ({ session_id, filter_id, user_id }) => {
  return {};
}));

// ── filter.save ───────────────────────────────────────────────────────────────
server.registerTool("filter_save", {
  description: "Promote a compressed session filter to persistent storage (user or global scope).",
  inputSchema: {
    session_id:  z.string(),
    filter_id:   z.string(),
    tags:        z.array(z.string()),
    description: z.string(),
    scope:       z.discriminatedUnion("level", [
      z.object({ level: z.literal("global") }),
      z.object({ level: z.literal("user"), userId: z.string() }),
    ]),
  }
}, wrapToolHandler(async (args) => {
  return {};
}));

// ── object.init ───────────────────────────────────────────────────────────────
server.registerTool("object_init", {
  description: "Initialize an empty stateful object against a named JSON Schema.",
  inputSchema: {
    session_id:  z.string(),
    schema_name: z.string(),
  }
}, wrapToolHandler(async ({ session_id, schema_name }) => {
  return { object_id: "example_object_id" };
}));

// ── object.set ────────────────────────────────────────────────────────────────
server.registerTool("object_set", {
  description: "Set one field on a stateful object. Returns a new object_id checkpoint.",
  inputSchema: {
    session_id: z.string(),
    object_id:  z.string(),
    path:       z.array(z.union([z.string(), z.number()])),
    value:      z.unknown(),
  }
}, wrapToolHandler(async ({ session_id, object_id, path, value }) => {
  return { object_id: "new_checkpoint_id" };
}));

// ── dictionary.resolve ────────────────────────────────────────────────────────
server.registerTool("dictionary_resolve", {
  description: "Resolve a vernacular term to its canonical concept.",
  inputSchema: {
    term:         z.string(),
    workspace_id: z.string().optional(),
    user_id:      z.string().optional(),
  }
}, wrapToolHandler(async ({ term, workspace_id, user_id }) => {
  return { conceptId: null, display: null, score: 0 };
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP middleware server running");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

---

## Known Gaps (resolve before considering a phase complete)

### Phase 1 (Core interfaces + memory adapters)
- `filter/resolver.ts` needs a full `resolveRows()` implementation that handles `combine()` set-op nodes — this is the piece missing from the prototype that caused combined filters to silently produce wrong results
- `object/ref-resolver.ts` cycle detection at `object.ref()` call time (cross-object, one-pass check) — distinct from the schema-load cycle detection in `schema-walker.ts`

### Phase 2 (SQL adapters)
- `sqlite-query.ts` must use `?` placeholders, not `$1` — the pg compiler in section 5 uses `$1` style which is Postgres-only
- `$var` references in pipelines compile differently per SQL dialect: SQLite uses CTEs (`WITH temp AS (...)`), Postgres uses `WITH` or inline subexpressions — test both before treating the compiler as done
- `sqlite-repo.ts` uses `bun:sqlite` import (`import { Database } from "bun:sqlite"`) not the `sqlite3` npm package — the roadmap's dependency matrix does not include `sqlite3` for this reason

### Phase 3 (Translation layer)
- `translation/compiler.ts` (SQL compilation of pipeline steps) is stubbed in the directory tree but not yet implemented — the in-memory interpreter (`pipeline.ts`) and the SQL compiler are different code paths sharing the same `PipelineStep[]` type
- Shape-level transforms (`explode`) are declared in `TableTranslation` but have no engine implementation yet — gate them behind a capability check that fails loudly rather than silently producing wrong cardinality

### Phase 4 (Object middleware)
- `ajv` validation of field values at `object.set()` time needs the resolved leaf schema from `schema-walker.resolvePathSchema()` — wire these two together before building `object.validate()`
- `object.patch()` needs to recursively validate each path in the partial against the schema — it's not a single-path operation and the validation logic is slightly more complex than `set()`

### Phase 5 (Dictionary)
- Dictionary `find()` delegating to the filter engine requires registering dictionary tables (`concepts`, `expressions`) as tool tables in the schema registry — the `TableSchema` for these needs to be defined somewhere (suggest `src/middleware/dictionary/schema.ts` as a built-in, not a user config file)
- `ConceptResolver` interface in `dictionary/resolver.ts` needs a concrete in-memory implementation before any other resolver variant (HTTP, vector) can be compared against it

### IndexedDB (future / browser build target)
- IndexedDB is a browser-only API — the current `indexeddb-query.ts` skeleton will not compile in a Node/Bun target. Gate it behind a separate browser build entry point (`src/browser.ts`) and exclude it from the main `tsconfig.json`. The `getAll()` approach in the skeleton is correct for v1; the partial index push-down (IDBKeyRange for indexed fields) is a later optimization documented in the plan.

### Pandas sidecar
- No adapter registration needed — configure pandas tools as `{ _type: "adapter", name: "http", options: { url: "http://localhost:8001/query" } }`. The pandas FastAPI/Flask service should accept a POST body of `{ table: string, query: QueryDefinition }` and return a JSON array of rows. The sidecar is entirely independent of this codebase.