# Implementation Roadmap — Filter + Dictionary MCP Middleware

This roadmap provides the concrete file structure, dependency requirements, and self-contained TypeScript skeletons to guide the implementation of the Filter + Dictionary MCP server.

---

## Directory Layout

```
filter-mcp-server/
├── config/
│   ├── default-filters.json      # Ephemeral fallback filters
│   └── default-dictionary.json   # Built-in fallback concepts and aliases
├── src/
│   ├── config/
│   │   ├── types.ts              # ResourceLocator, MiddlewareConfig type declarations
│   │   └── loader.ts             # resolveSource() helper and config boot loader
│   ├── errors/
│   │   ├── types.ts              # McpError class and error code definitions
│   │   └── format.ts             # JSON error serializer for MCP responses
│   ├── middleware/
│   │   ├── filter/
│   │   │   ├── types.ts          # FilterCondition, TableSchema types
│   │   │   ├── store.ts          # FilterStore coordinator (manages 3-tier lookup)
│   │   │   └── engine.ts         # Query engine coordinator
│   │   ├── dictionary/
│   │   │   ├── types.ts          # Namespaces, Concepts, Expressions types
│   │   │   ├── store.ts          # DictionaryStore (concept tables / filter reuse)
│   │   │   └── resolver.ts       # ConceptResolver interface and ranked matching
│   │   └── object/
│   │       ├── types.ts          # Object types, Path, ValidationResult
│   │       └── store.ts          # ObjectStore (ephemeral set/patch, cyclical checks)
│   ├── adapters/
│   │   ├── registry.ts           # Adapter Registry (registerAdapter, resolveAdapter)
│   │   ├── storage/
│   │   │   ├── memory-repo.ts    # Ephemeral in-memory repository implementation
│   │   │   └── sqlite-repo.ts    # Local database persistence repository
│   │   └── engines/
│   │       ├── memory-query.ts   # In-memory execution query engine
│   │       └── http-query.ts     # Proxy HTTP request query engine
│   └── index.ts                  # MCP Server Entrypoint (wires tools and stdio)
├── package.json
└── tsconfig.json
```

---

## Dependency Matrix

Add the following to your `package.json` dependencies:
- **`@modelcontextprotocol/sdk`** (`^1.2.0`): Protocol stdio transport and server primitives.
- **`zod`** (`^3.22.0`): Runtime validation schemas for MCP tool input arguments.
- **`ajv`** (`^8.12.0`): JSON Schema validation engine for Object middleware structural and completeness checks.
- **`bun-types`** (`latest`): TypeScript definitions for Bun environment (includes native `bun:sqlite` types).

---

## Core Skeletons & Pseudocode

### 1. Boot Sequence & Registry (`src/adapters/registry.ts`, `src/config/loader.ts`)

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import type { ResourceLocator, MiddlewareConfig } from "../config/types";

// --- ADAPTER REGISTRY ---
export interface AdapterFactory<T> {
  create(options: Record<string, any>): Promise<T>;
}

const registry = new Map<string, AdapterFactory<any>>();

export function registerAdapter<T>(name: string, factory: AdapterFactory<T>): void {
  registry.set(name, factory);
}

export async function resolveAdapter<T>(name: string, options: Record<string, any> = {}): Promise<T> {
  const factory = registry.get(name);
  if (!factory) {
    throw new Error(`Unregistered adapter name requested: "${name}"`);
  }
  return factory.create(options);
}

// --- RESOURCE LOCATOR RESOLVER ---
export async function resolveSource(locator: ResourceLocator, workspaceRoot: string): Promise<any> {
  switch (locator._type) {
    case "adapter":
      return resolveAdapter(locator.name, locator.options);
    case "file": {
      const filePath = path.resolve(workspaceRoot, locator.path);
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    }
    case "remote_url": {
      const response = await fetch(locator.url, { headers: locator.headers });
      if (!response.ok) {
        throw new Error(`Failed HTTP fetch to remote schema URL: ${locator.url} (Status: ${response.status})`);
      }
      return response.json();
    }
    default:
      throw new Error(`Unknown ResourceLocator type: ${(locator as any)._type}`);
  }
}
```

### 2. Pipeline Interpreter (`src/middleware/filter/engine.ts`)

```typescript
import type { PipelineStep, ArgRef } from "./types";

export function evaluatePipeline(
  step: PipelineStep,
  row: Record<string, any>,
  constants: Record<string, any>,
  vars: Record<string, any>
): any {
  // Resolve arguments dynamically
  const resolvedArgs = step.args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      if ("$init" in arg) {
        // First look in row properties, then fallback to config-declared constants
        return row[arg.$init] !== undefined ? row[arg.$init] : constants[arg.$init];
      }
      if ("$var" in arg) {
        return vars[arg.$var];
      }
    }
    return arg; // Literal value (number, string, boolean)
  });

  // Evaluate arithmetic and logic functions
  switch (step.op) {
    case "add": return resolvedArgs[0] + resolvedArgs[1];
    case "sub": return resolvedArgs[0] - resolvedArgs[1];
    case "mul": return resolvedArgs[0] * resolvedArgs[1];
    case "div": {
      if (resolvedArgs[1] === 0) throw new Error("Division by zero in transform pipeline.");
      return resolvedArgs[0] / resolvedArgs[1];
    }
    case "eq": return resolvedArgs[0] === resolvedArgs[1];
    case "gt": return resolvedArgs[0] > resolvedArgs[1];
    case "year": {
      const date = new Date(resolvedArgs[0]);
      if (isNaN(date.getTime())) return null;
      return date.getFullYear();
    }
    case "json_parse": {
      try {
        return JSON.parse(resolvedArgs[0]);
      } catch {
        if (step.on_missing && typeof step.on_missing === "object" && "literal" in step.on_missing) {
          return step.on_missing.literal;
        }
        return null;
      }
    }
    case "get": {
      const obj = resolvedArgs[0];
      if (!obj || typeof obj !== "object") return null;
      const path = resolvedArgs.slice(1);
      let curr = obj;
      for (const segment of path) {
        curr = curr[segment];
        if (curr === undefined || curr === null) {
          if (step.on_missing && typeof step.on_missing === "object" && "literal" in step.on_missing) {
            return step.on_missing.literal;
          }
          return null;
        }
      }
      return curr;
    }
    default:
      throw new Error(`Unsupported pipeline transformation operator: ${step.op}`);
  }
}
```

### 3. Object Cycle-Detection (`src/middleware/object/store.ts`)

Cycle detection runs once at schema-load time by analyzing definitions in `$defs`:

```typescript
export function validateCycleFree(defs: Record<string, any>): void {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(defName: string) {
    visited.add(defName);
    recursionStack.add(defName);

    const schema = defs[defName];
    if (schema && schema.properties) {
      for (const [propName, propVal] of Object.entries<any>(schema.properties)) {
        if (propVal.$ref && propVal.$ref.startsWith("#/$defs/")) {
          const targetRef = propVal.$ref.replace("#/$defs/", "");
          if (recursionStack.has(targetRef)) {
            throw new Error(`Recursive cycle detected in schema definitions: ${defName} -> ${targetRef}`);
          }
          if (!visited.has(targetRef)) {
            dfs(targetRef);
          }
        }
      }
    }
    recursionStack.delete(defName);
  }

  for (const defName of Object.keys(defs)) {
    if (!visited.has(defName)) {
      dfs(defName);
    }
  }
}
```

### 4. MCP Tool Registration & Error Wrapping (`src/index.ts`)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { McpError } from "./errors/types";

const server = new McpServer({ name: "mcp-middleware", version: "1.0.0" });

// Generic error wrapping function to return taxonomic error codes programmatically
function wrapToolHandler<TArgs extends Record<string, any>, TResult>(
  handler: (args: TArgs) => Promise<TResult>
) {
  return async (args: TArgs) => {
    try {
      const result = await handler(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      const code = err instanceof McpError ? err.code : "INTERNAL_SERVER_ERROR";
      const message = err.message || String(err);
      const details = err instanceof McpError ? err.details : {};

      const errorPayload = {
        error: { code, message, details }
      };

      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(errorPayload, null, 2) }]
      };
    }
  };
}

// Example tool registration with threaded session context
server.registerTool(
  "filter_add",
  {
    description: "Append filter conditions to an active session filter chain.",
    inputSchema: {
      filter_id: z.string().describe("The ID of the parent filter state."),
      operations: z.array(z.object({
        property: z.string(),
        operator: z.string(),
        value: z.any()
      })).describe("Conditions to apply."),
      session_id: z.string().describe("Client session identification context.")
    }
  },
  wrapToolHandler(async ({ filter_id, operations, session_id }) => {
    // Thread session_id directly to the FilterStore coordinator
    // const newFilterId = await filterStore.add(filter_id, operations, session_id);
    return { new_filter_id: "example_child_id" };
  })
);
```

### 5. Postgres Adapter Parameterized SQL Compiler (`src/adapters/engines/pg-query.ts`)

Postgres queries must be compiled statelessly into a parameterized statement (with `$1`, `$2` placeholders) rather than string interpolation, enabling safe type handling and injection prevention:

```typescript
import type { QueryDefinition, FilterCondition } from "../../middleware/filter/types";

export interface ParameterizedQuery {
  text: string;
  values: any[];
}

export class PostgresQueryCompiler {
  public compile(tableName: string, query: QueryDefinition): ParameterizedQuery {
    const values: any[] = [];
    const getPlaceholder = (val: any): string => {
      values.push(val);
      return `$${values.length}`;
    };

    let selectList = "*";
    let whereClause = "";
    let groupByClause = "";
    let orderByClause = "";
    let limitClause = "";

    // 1. Projections & Aggregations
    if (query.group_by && query.group_by.length > 0) {
      const parts = query.group_by.map((col) => `"${col}"`);
      if (query.aggregations) {
        for (const agg of query.aggregations) {
          let expr = "";
          if (agg.function === "count") {
            expr = `COUNT(${agg.property === "*" ? "*" : `"${agg.property}"`})`;
          } else if (agg.function === "count_distinct") {
            expr = `COUNT(DISTINCT "${agg.property}")`;
          } else if (agg.function === "sum") {
            expr = `SUM("${agg.property}")`;
          } else if (agg.function === "avg") {
            expr = `AVG("${agg.property}")`;
          } else {
            expr = `${agg.function.toUpperCase()}("${agg.property}")`;
          }
          parts.push(`${expr} AS "${agg.alias}"`);
        }
      }
      selectList = parts.join(", ");
      groupByClause = ` GROUP BY ${query.group_by.map((col) => `"${col}"`).join(", ")}`;
    } else if (query.projections && query.projections.length > 0) {
      selectList = query.projections.map((col) => `"${col}"`).join(", ");
    }

    // 2. Filters (WHERE)
    if (query.filters && query.filters.length > 0) {
      const conds = query.filters.map((c) => this.compileCondition(c, getPlaceholder));
      whereClause = ` WHERE ${conds.join(" AND ")}`;
    }

    // 3. Sorting (ORDER BY)
    if (query.sort && query.sort.length > 0) {
      orderByClause = ` ORDER BY ${query.sort
        .map((s) => `"${s.property}" ${s.direction === "desc" ? "DESC" : "ASC"}`)
        .join(", ")}`;
    }

    // 4. Limit
    if (query.limit && query.limit > 0) {
      limitClause = ` LIMIT ${getPlaceholder(query.limit)}`;
    }

    const text = `SELECT ${selectList} FROM "${tableName}"${whereClause}${groupByClause}${orderByClause}${limitClause}`;
    return { text, values };
  }

  private compileCondition(cond: FilterCondition, getPlaceholder: (val: any) => string): string {
    const prop = `"${cond.property}"`;
    const val = cond.value;

    switch (cond.operator) {
      case "eq":
        return `${prop} = ${getPlaceholder(val)}`;
      case "neq":
        return `${prop} != ${getPlaceholder(val)}`;
      case "gt":
        return `${prop} > ${getPlaceholder(val)}`;
      case "geq":
        return `${prop} >= ${getPlaceholder(val)}`;
      case "lt":
        return `${prop} < ${getPlaceholder(val)}`;
      case "leq":
        return `${prop} <= ${getPlaceholder(val)}`;
      case "like":
        return `${prop} ILIKE ${getPlaceholder(`%${val}%`)}`;
      case "in_set":
        return `${prop} = ANY(${getPlaceholder(Array.isArray(val) ? val : [val])})`;
      case "between":
        if (Array.isArray(val) && val.length === 2) {
          return `${prop} BETWEEN ${getPlaceholder(val[0])} AND ${getPlaceholder(val[1])}`;
        }
        throw new Error("Postgres compiler: between operator requires array of 2 elements");
      default:
        throw new Error(`Unsupported Postgres operator: ${cond.operator}`);
    }
  }
}```

### 6. Simplified IndexedDB In-Memory Loader Engine (`src/adapters/engines/indexeddb-query.ts`)

For client-side/browser environments, the database dataset can be loaded fully into a JavaScript array via a single bulk `store.getAll()` operation, and then processed directly by the generic in-memory execution engine:

```typescript
import type { QueryDefinition } from "../../middleware/filter/types";
import { executeQuery as memoryExecute } from "./memory-query";

export class IndexedDbMemoryQueryEngine {
  constructor(private db: IDBDatabase) {}

  public async execute(tableName: string, query: QueryDefinition): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(tableName, "readonly");
      const store = transaction.objectStore(tableName);
      const request = store.getAll(); // Single optimized bulk fetch operation

      request.onsuccess = () => {
        const dataset = request.result;
        // Delegate full query execution directly to the standard in-memory engine
        const filtered = memoryExecute(dataset, query);
        resolve(filtered);
      };

      request.onerror = () => {
        reject(transaction.error || new Error("IndexedDB bulk read transaction failed."));
      };
    });
  }
}
```

### 7. HTTP Client Adapter (`src/adapters/engines/http-query.ts`)

For remote tool backends, the adapter serializes the standard `QueryDefinition` payload and POSTs it over the network to the tool's configured backend API:

```typescript
import type { QueryDefinition } from "../../middleware/filter/types";

export class HttpQueryEngine {
  constructor(
    private endpointUrl: string,
    private extraHeaders?: Record<string, string>
  ) {}

  public async execute(tableName: string, query: QueryDefinition): Promise<any[]> {
    const url = new URL(this.endpointUrl);
    url.searchParams.set("table", tableName);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.extraHeaders
      },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      throw new Error(`HTTP engine failed executing query against ${this.endpointUrl}: Status ${response.status}`);
    }

    const result = await response.json();
    if (!Array.isArray(result)) {
      throw new Error("HTTP query engine response must be a JSON array of rows.");
    }
    return result;
  }
}
```

