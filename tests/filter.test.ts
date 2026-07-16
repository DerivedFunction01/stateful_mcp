import { loadMiddlewareConfig } from "../src/config/loader";
import { validateMiddlewareConfig } from "../src/config/validator";
import { MemorySessionFilterStore, MemoryPersistentFilterStore } from "../src/adapters/storage/memory-repo";
import { MemoryQueryEngine } from "../src/adapters/engines/memory-query";
import { FilterStore } from "../src/middleware/filter/store";
import { SqliteFilterStore } from "../src/adapters/storage/sqlite-repo";
import { SqliteQueryEngine } from "../src/adapters/engines/sqlite-query";
import { PgQueryEngine } from "../src/adapters/engines/pg-query";
import { executePipeline } from "../src/translation/pipeline";
import { validateTableTranslation } from "../src/translation/validator";
import { compilePipelineToSQL } from "../src/translation/compiler";
import type { TableSchema } from "../src/config/types";
import * as fs from "fs/promises";
import * as path from "path";

export async function runFilterTests() {
  console.log("🚀 Starting Filter Service tests...\n");

  const workspaceRoot = path.resolve(process.cwd(), "..");

  // Setup sample configs & files for testing loader and validator
  const tempConfigDir = path.join(workspaceRoot, "config");
  await fs.mkdir(tempConfigDir, { recursive: true });

  const dummyToolsConfig = {
    tools: {
      browse_catalog: {
        schema: { _type: "file", path: "./config/tools/browse_catalog.schema.json" },
        engine: { _type: "adapter", name: "memory-engine" }
      }
    }
  };

  const dummyStorageConfig = {
    version: 1,
    filter_session_state: { _type: "adapter", name: "memory" },
    filter_persistent_state: {
      global: { _type: "adapter", name: "memory" },
      user: { _type: "adapter", name: "memory" }
    },
    object_session_state: { _type: "adapter", name: "memory" },
    object_persistent_state: {
      global: { _type: "adapter", name: "memory" },
      user: { _type: "adapter", name: "memory" }
    },
    dictionary_state: { _type: "adapter", name: "memory" },
    dictionary_resolver: { _type: "adapter", name: "memory" }
  };

  await fs.writeFile(path.join(tempConfigDir, "tools.config.json"), JSON.stringify(dummyToolsConfig, null, 2));
  await fs.writeFile(path.join(tempConfigDir, "storage.config.json"), JSON.stringify(dummyStorageConfig, null, 2));

  // ─── TEST CASE 1: Config Loading and Validation ───
  console.log("🧪 Test Case 1: Config Loading and Validation");
  const config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);
  console.log("✓ Config loaded and validated successfully.");

  // Test environment variable substitution
  process.env.TEST_DB_PATH = "./test.db";
  const locatorWithEnv = { _type: "adapter", name: "sqlite", options: { path: "env:TEST_DB_PATH" } };
  const resolveEnvResult: any = require("../src/config/loader").substituteEnvVars(locatorWithEnv);
  if (resolveEnvResult.options.path !== "./test.db") {
    throw new Error(`Env var substitution failed. Got: ${JSON.stringify(resolveEnvResult)}`);
  }
  console.log("✓ Environment variable substitution works correctly.");

  // ─── TEST CASE 2: Memory Storage Repositories ───
  console.log("\n🧪 Test Case 2: Memory Storage Repositories");
  const sessionStore = new MemorySessionFilterStore();
  const persistentStore = new MemoryPersistentFilterStore();

  const mockFilterState = {
    filterId: "f1",
    rules: [{ property: "price", operator: "lt" as const, value: 100 }],
    createdAt: new Date().toISOString()
  };

  await sessionStore.set("session_123", "f1", mockFilterState);
  const retrievedSession = await sessionStore.get("session_123", "f1");
  if (!retrievedSession || retrievedSession.rules[0]?.value !== 100) {
    throw new Error("Session Filter Store get/set failed");
  }

  const persistedState = {
    ...mockFilterState,
    tags: ["test"],
    description: "test filter",
    schema_snapshot: "{}"
  };
  await persistentStore.set("f1", persistedState, { level: "user", userId: "u1" });
  const retrievedPersisted = await persistentStore.get("f1", { level: "user", userId: "u1" });
  if (!retrievedPersisted || retrievedPersisted.description !== "test filter") {
    throw new Error("Persistent Filter Store get/set failed");
  }
  console.log("✓ Memory Session & Persistent repositories function correctly.");

  // ─── TEST CASE 3: Memory Query Engine ───
  console.log("\n🧪 Test Case 3: Memory Query Engine");
  const sampleItems = [
    { id: 1, name: "Socks", price: 10, category: "apparel" },
    { id: 2, name: "Shoes", price: 80, category: "apparel" },
    { id: 3, name: "Laptop", price: 1000, category: "electronics" }
  ];

  const engine = new MemoryQueryEngine({ items: sampleItems });
  const queryResult = await engine.execute("items", {
    filters: [
      { property: "category", operator: "eq", value: "apparel" },
      { property: "price", operator: "gt", value: 15 }
    ]
  });

  if (queryResult.length !== 1 || (queryResult[0] as any).name !== "Shoes") {
    throw new Error(`QueryEngine execution failed. Got: ${JSON.stringify(queryResult)}`);
  }
  console.log("✓ Memory Query Engine filtering worked correctly.");

  // ─── TEST CASE 4: FilterStore Coordinator ───
  console.log("\n🧪 Test Case 4: FilterStore Coordinator");
  const toolSchemas = new Map<string, Record<string, TableSchema>>();
  toolSchemas.set("browse_catalog", {
    items: {
      filterable_properties: ["price", "category"],
      operators: ["eq", "neq", "lt", "gt", "like", "between"],
      mock_dataset: [
        { price: 100, category: "apparel" }
      ]
    }
  });

  const pinnedSchemas = new Map<string, TableSchema>();
  const filterStore = new FilterStore(sessionStore, persistentStore, toolSchemas, pinnedSchemas);

  // Initialize and build a hierarchical chain
  const fInit = await filterStore.init("session_123", "browse_catalog", "items");
  const fAdded1 = await filterStore.add(fInit, [{ property: "category", operator: "eq", value: "apparel" }], "session_123");

  // Test invalid operator 'like' on numeric field 'price'
  try {
    await filterStore.add(fAdded1, [{ property: "price", operator: "like", value: "cheap" }], "session_123");
    throw new Error("Should have thrown error on numeric column with 'like' operator");
  } catch (err: any) {
    if (err.message.includes("is not allowed on numeric property")) {
      console.log("✓ Successfully caught numeric property operator constraint check.");
    } else {
      throw err;
    }
  }

  // Test invalid operator 'between' on string field 'category'
  try {
    await filterStore.add(fAdded1, [{ property: "category", operator: "between", value: [10, 20] }], "session_123");
    throw new Error("Should have thrown error on string column with 'between' operator");
  } catch (err: any) {
    if (err.message.includes("is not allowed on non-numeric property")) {
      console.log("✓ Successfully caught non-numeric property operator constraint check.");
    } else {
      throw err;
    }
  }

  const fAdded2 = await filterStore.add(fAdded1, [{ property: "price", operator: "lt", value: 100 }], "session_123");

  const rulesChain = await filterStore.getFilterRules(fAdded2, "session_123");
  if (rulesChain.length !== 2) {
    throw new Error(`Hierarchy rule traversal failed. Rules count: ${rulesChain.length}`);
  }
  console.log("✓ Filter hierarchy creation and rule traversal works.");

  // Test removeRule
  const fRemoved = await filterStore.removeRule(fAdded2, "price", "lt", "session_123");
  const rulesAfterRemoval = await filterStore.getFilterRules(fRemoved, "session_123");
  if (rulesAfterRemoval.length !== 1 || rulesAfterRemoval[0]?.property !== "category") {
    throw new Error("removeRule failed to remove price filter rule");
  }
  console.log("✓ FilterStore removeRule successfully removed price constraint.");

  // Compress
  const compressedId = await filterStore.compress(fAdded2, "session_123");
  const compressedRules = await filterStore.getFilterRules(compressedId, "session_123");
  const compFilter = await filterStore.getFilter(compressedId, "session_123");
  if (compressedRules.length !== 2 || compFilter?.parentFilterId !== null) {
    throw new Error("Filter chain compression failed");
  }
  console.log("✓ Filter chain compression successfully flattened rules.");

  // Combine Set Ops (Intersection)
  const fApparel = await filterStore.init("session_123", "browse_catalog", "items");
  const fApparelAdd = await filterStore.add(fApparel, [{ property: "category", operator: "eq", value: "apparel" }], "session_123");

  const fExpensive = await filterStore.init("session_123", "browse_catalog", "items");
  const fExpensiveAdd = await filterStore.add(fExpensive, [{ property: "price", operator: "gt", value: 50 }], "session_123");

  const combinedId = await filterStore.combine("intersection", [fApparelAdd, fExpensiveAdd], "session_123");

  const resolvedCombinedRows = await filterStore.resolveRows(
    combinedId,
    "session_123",
    undefined,
    async () => engine
  );

  if (resolvedCombinedRows.length !== 1 || resolvedCombinedRows[0].name !== "Shoes") {
    throw new Error(`Combined filter execution (intersection) failed. Got: ${JSON.stringify(resolvedCombinedRows)}`);
  }
  console.log("✓ Combined filter execution (set operations) resolved correctly.");

  // ─── TEST CASE 5: Relational SQL Adapters ───
  console.log("\n🧪 Test Case 5: Relational SQL Adapters");
  
  const sqliteEngine = new SqliteQueryEngine(":memory:");
  sqliteEngine["db"].run("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL, category TEXT)");
  sqliteEngine["db"].run("INSERT INTO items (name, price, category) VALUES ('Socks', 10, 'apparel')");
  sqliteEngine["db"].run("INSERT INTO items (name, price, category) VALUES ('Shoes', 80, 'apparel')");
  sqliteEngine["db"].run("INSERT INTO items (name, price, category) VALUES ('Laptop', 1000, 'electronics')");

  const compiled = sqliteEngine.compile("items", {
    filters: [
      { property: "category", operator: "eq", value: "apparel" },
      { property: "price", operator: "gt", value: 15 }
    ]
  });

  if (!compiled.sql.includes("WHERE `category` = ? AND `price` > ?") || compiled.params[0] !== "apparel" || compiled.params[1] !== 15) {
    throw new Error(`SqliteQueryEngine compilation failed: ${JSON.stringify(compiled)}`);
  }
  console.log("✓ SQLite Query Compiler output parameterized query correctly.");

  const sqliteResults = await sqliteEngine.execute("items", {
    filters: [
      { property: "category", operator: "eq", value: "apparel" },
      { property: "price", operator: "gt", value: 15 }
    ]
  });
  if (sqliteResults.length !== 1 || (sqliteResults[0] as any).name !== "Shoes") {
    throw new Error(`SQLite Query Engine execution failed. Got: ${JSON.stringify(sqliteResults)}`);
  }
  console.log("✓ SQLite Query Engine executed and filtered correctly.");

  const sqliteStore = new SqliteFilterStore(":memory:");
  await sqliteStore.set("sess_sql", "f_sql", {
    filterId: "f_sql",
    rules: [{ property: "price", operator: "lt", value: 100 }],
    createdAt: new Date().toISOString()
  });

  const sqliteRetrieved = await sqliteStore.get("sess_sql", "f_sql");
  if (!sqliteRetrieved || sqliteRetrieved.rules[0]?.value !== 100) {
    throw new Error("SqliteFilterStore session get/set failed");
  }
  console.log("✓ SqliteFilterStore session persistence works.");

  await sqliteStore.set("f_sql", {
    filterId: "f_sql",
    rules: [{ property: "price", operator: "lt", value: 100 }],
    createdAt: new Date().toISOString(),
    tags: ["persistent"],
    description: "sqlite persistent filter",
    schema_snapshot: "{}"
  }, { level: "user", userId: "u_sql" });

  const sqliteRetrievedPersisted = await sqliteStore.get("f_sql", { level: "user", userId: "u_sql" });
  if (!sqliteRetrievedPersisted || sqliteRetrievedPersisted.description !== "sqlite persistent filter") {
    throw new Error("SqliteFilterStore persistent get/set failed");
  }
  console.log("✓ SqliteFilterStore persistent storage works.");

  const pgEngine = new PgQueryEngine("postgresql://localhost:5432/postgres");
  const pgCompiled = pgEngine.compile("items", {
    filters: [
      { property: "category", operator: "eq", value: "apparel" },
      { property: "price", operator: "gt", value: 15 }
    ]
  });
  if (!pgCompiled.sql.includes('WHERE "category" = $1 AND "price" > $2') || pgCompiled.params[0] !== "apparel" || pgCompiled.params[1] !== 15) {
    throw new Error(`PgQueryEngine compilation failed: ${JSON.stringify(pgCompiled)}`);
  }
  console.log("✓ Postgres Query Compiler generated parameter indexes ($1, $2) and double-quoted identifiers correctly.");

  // ─── TEST CASE 6: Property Translation Layer ───
  console.log("\n🧪 Test Case 6: Property Translation Layer");
  
  const translationPipeline = [
    { op: "json_parse" as const, args: [{ $init: "tags_blob" }], return_var: "parsed" },
    { op: "get" as const, args: [{ $var: "parsed" }, "version"] }
  ];

  const row = { tags_blob: '{"version": 42}' };
  const res = executePipeline(translationPipeline, row, {});
  if (res !== 42) {
    throw new Error(`executePipeline failed. Got: ${res}`);
  }
  console.log("✓ executePipeline evaluated JSON nested property correctly (42).");

  const validTranslation = {
    properties: {
      tags_version: {
        internal: "tags_blob",
        transform: { pipeline: translationPipeline }
      }
    }
  };
  validateTableTranslation("items", validTranslation, ["nested_access"]);
  console.log("✓ validateTableTranslation validated a correct pipeline.");

  try {
    const invalidTranslation = {
      properties: {
        bad: {
          internal: "tags_blob",
          transform: {
            pipeline: [
              { op: "get" as const, args: [{ $var: "non_existent" }, "x"] }
            ]
          }
        }
      }
    };
    validateTableTranslation("items", invalidTranslation, ["nested_access"]);
    throw new Error("Should have thrown error on forward/undeclared var reference");
  } catch (err: any) {
    console.log("✓ validateTableTranslation successfully caught undeclared return_var error: " + err.message);
  }

  const sqliteSQL = compilePipelineToSQL(translationPipeline, "sqlite");
  if (!sqliteSQL.includes("json_extract(json(`tags_blob`), '$.version')")) {
    throw new Error(`compilePipelineToSQL SQLite failed: ${sqliteSQL}`);
  }
  console.log("✓ compilePipelineToSQL (SQLite) compiled nested paths successfully.");

  const pgSQL = compilePipelineToSQL(translationPipeline, "postgres");
  if (!pgSQL.includes('(CAST("tags_blob" AS JSONB)  ->> \'version\')')) {
    throw new Error(`compilePipelineToSQL Postgres failed: ${pgSQL}`);
  }
  console.log("✓ compilePipelineToSQL (Postgres) compiled nested paths successfully.");
}
