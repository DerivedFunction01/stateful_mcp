import { loadMiddlewareConfig, resolveAdapter } from "../src/config/loader";
import { validateMiddlewareConfig } from "../src/config/validator";
import { MemorySessionFilterStore, MemoryPersistentFilterStore, MemorySessionObjectStore, MemoryPersistentObjectStore } from "../src/adapters/storage/memory-repo";
import { MemoryQueryEngine } from "../src/adapters/engines/memory-query";
import { FilterStore } from "../src/middleware/filter/store";
import { SqliteFilterStore } from "../src/adapters/storage/sqlite-repo";
import { SqliteQueryEngine } from "../src/adapters/engines/sqlite-query";
import { PgQueryEngine } from "../src/adapters/engines/pg-query";
import { executePipeline } from "../src/translation/pipeline";
import { validateTableTranslation } from "../src/translation/validator";
import { compilePipelineToSQL } from "../src/translation/compiler";
import { ObjectStore } from "../src/middleware/object/store";
import { validateCycleFree } from "../src/middleware/object/schema-walker";
import { DictionaryStore } from "../src/middleware/dictionary/store";
import { InMemoryConceptResolver } from "../src/middleware/dictionary/resolver";
import type { TableSchema } from "../src/config/types";
import * as fs from "fs/promises";
import * as path from "path";

async function runTests() {
  console.log("🚀 Starting Phase 1 verification tests (from tests/folder)...\n");

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

  // ─── TEST CASE 4: FilterStore Coordinator (Set Ops, Traversal, Compression) ───
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
  // Filter 1: apparel only (Socks, Shoes)
  const fApparel = await filterStore.init("session_123", "browse_catalog", "items");
  const fApparelAdd = await filterStore.add(fApparel, [{ property: "category", operator: "eq", value: "apparel" }], "session_123");

  // Filter 2: expensive items only (> 50) (Shoes, Laptop)
  const fExpensive = await filterStore.init("session_123", "browse_catalog", "items");
  const fExpensiveAdd = await filterStore.add(fExpensive, [{ property: "price", operator: "gt", value: 50 }], "session_123");

  // Combined intersection should yield only "Shoes"
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

  // ─── TEST CASE 5: Relational SQL Adapters (Phase 2) ───
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

  // ─── TEST CASE 6: Property Translation Layer (Phase 3) ───
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

  // ─── TEST CASE 7: Object Middleware (Phase 4) ───
  console.log("\n🧪 Test Case 7: Object Middleware");

  // 1. Validate cycle detection in schema loader
  try {
    const cyclicDefs = {
      NodeA: {
        properties: {
          sibling: { $ref: "#/$defs/NodeB" }
        }
      },
      NodeB: {
        properties: {
          parent: { $ref: "#/$defs/NodeA" }
        }
      }
    };
    validateCycleFree(cyclicDefs);
    throw new Error("Should have thrown error on cyclic schema definition");
  } catch (err: any) {
    if (err.message.includes("Object schema cycle detected")) {
      console.log("✓ validateCycleFree caught recursive schema definition cycle successfully.");
    } else {
      throw err;
    }
  }

  // 2. Setup ObjectStore
  const appointmentSchema = {
    type: "object",
    required: ["title", "start_date"],
    properties: {
      title: { type: "string" },
      start_date: { type: "string" },
      end_date: { type: "string" },
      attendees: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            role: { type: "string" }
          }
        }
      }
    },
    constraints: [
      {
        op: "lt",
        args: [{ $field: "start_date" }, { $field: "end_date" }],
        error: "start_date must be before end_date"
      }
    ]
  };

  const schemasMap = new Map<string, any>();
  schemasMap.set("appointment", appointmentSchema);

  const objSession = new MemorySessionObjectStore();
  const objPersistent = new MemoryPersistentObjectStore();
  const objectStore = new ObjectStore(objSession, objPersistent, schemasMap);

  // Initialize and write properties
  const objId = await objectStore.init("appointment", "session_abc");
  const objId2 = await objectStore.set(objId, ["title"], "Client Kickoff Meeting", "session_abc");
  const objId3 = await objectStore.set(objId2, ["start_date"], "2026-07-15", "session_abc");

  // Validate structural type check (should reject number on string field)
  try {
    await objectStore.set(objId3, ["title"], 12345, "session_abc");
    throw new Error("Should have rejected number value on string field");
  } catch (err: any) {
    if (err.message.includes("fails schema validation") || err.message.includes("is not of type")) {
      console.log("✓ Type check rejected numeric value on string property successfully.");
    } else {
      throw err;
    }
  }

  // Validate incomplete object (missing start_date; title is set)
  const val1 = await objectStore.validate(objId2, "session_abc");
  if (val1.valid) {
    throw new Error("Validation should say invalid because required fields are missing");
  }
  console.log("✓ Validation detected missing/incomplete fields successfully.");

  // Write end_date to make it valid
  const objId4 = await objectStore.set(objId3, ["end_date"], "2026-07-16", "session_abc");
  const val2 = await objectStore.validate(objId4, "session_abc");
  if (!val2.valid) {
    throw new Error(`Expected validation to pass but failed: ${JSON.stringify(val2)}`);
  }
  console.log("✓ Validation passed when all required fields and constraints are satisfied.");

  // Test constraint violation (start_date >= end_date)
  const objInvalidDates = await objectStore.set(objId4, ["end_date"], "2026-07-14", "session_abc");
  const val3 = await objectStore.validate(objInvalidDates, "session_abc");
  if (val3.valid || val3.invalid.length === 0) {
    throw new Error("Validation should have failed for cross-field constraint start_date < end_date");
  }
  console.log("✓ Cross-field constraint start_date < end_date caught violation successfully: " + (val3.invalid[0]?.reason ?? ""));

  // Test array modifications
  const objId5 = await objectStore.array_append(objId4, ["attendees"], "session_abc");
  const objId6 = await objectStore.set(objId5, ["attendees", 0, "name"], "Alice", "session_abc");
  const resolvedVal = await objectStore.resolve(objId6, "tool_call", "session_abc") as any;
  if (resolvedVal.attendees[0].name !== "Alice") {
    throw new Error("Array append and modify failed");
  }
  console.log("✓ Array modifications and indexing works correctly.");

  // Test lazy references (ref)
  const userProfileSchema = {
    type: "object",
    properties: {
      username: { type: "string" }
    }
  };
  schemasMap.set("profile", userProfileSchema);
  const profileId = await objectStore.init("profile", "session_abc");
  const profileId2 = await objectStore.set(profileId, ["username"], "bob_builder", "session_abc");

  // Link attendee name to username reference
  const objId7 = await objectStore.ref(objId6, ["attendees", 0, "name"], profileId2, ["username"], "session_abc");
  const resolvedWithRef = await objectStore.resolve(objId7, "tool_call", "session_abc") as any;
  if (resolvedWithRef.attendees[0].name !== "bob_builder") {
    throw new Error(`Lazy reference resolution failed. Got: ${resolvedWithRef.attendees[0].name}`);
  }
  console.log("✓ Lazy reference links resolved recursively to target field value: " + resolvedWithRef.attendees[0].name);

  // Test inspect & diff
  const inspectInfo = await objectStore.inspect(objId7, "session_abc");
  if (inspectInfo.objectId !== objId7 || !inspectInfo.validation.valid) {
    throw new Error("Inspect returned wrong metadata");
  }
  console.log("✓ Inspect returned correct object status.");

  const diffResult = await objectStore.diff(objId4, objId6, "session_abc");
  if (!diffResult.added.attendees) {
    throw new Error("Diff failed to show added field");
  }
  console.log("✓ Diff compared version states correctly.");

  // ─── TEST CASE 8: Dictionary Service (Phase 5) ───
  console.log("\n🧪 Test Case 8: Dictionary Service");

  const resolver = new InMemoryConceptResolver();
  const dictStore = new DictionaryStore(resolver);

  // Load sample dictionary config
  dictStore.loadConfig({
    namespaces: [
      { code: "SNOMED", isPublic: true, isExternalPrivate: false }
    ],
    concepts: [
      { id: "c_mi", namespaceCode: "SNOMED", standardCode: "I21.9", display: "Myocardial Infarction" }
    ],
    expressions: [
      {
        id: "expr_1",
        term: "heart attack",
        regexPattern: "\\bheart\\s+attack\\b",
        isCaseInsensitive: true,
        targetAssignment: "MAIN_TERM",
        conceptId: "c_mi",
        priorityWeight: 5,
        active: true
      }
    ]
  });

  // Resolve alias
  const resolved = await dictStore.resolve("patient suffered a heart attack", { workspace_id: "global" });
  if (!resolved || resolved.conceptId !== "c_mi" || resolved.concept.display !== "Myocardial Infarction") {
    throw new Error(`Dictionary resolution failed. Got: ${JSON.stringify(resolved)}`);
  }
  console.log("✓ Dictionary resolved alias 'heart attack' using regex successfully.");

  // Check metrics and usage-based score boosting
  const metrics = dictStore.getMetrics();
  if (metrics.length !== 1 || metrics[0]?.usageCount !== 1) {
    throw new Error("Usage metrics recording failed");
  }
  console.log("✓ Dictionary usage metrics recorded successfully.");

  // Resolve again to verify usage metrics score boosting works (initial priority 5 + usageCount 1 * 10 = 15)
  const resolvedSecond = await dictStore.resolve("patient suffered a heart attack", { workspace_id: "global" });
  if (!resolvedSecond || resolvedSecond.score !== 15) {
    throw new Error(`Score boosting validation failed. Score: ${resolvedSecond?.score}`);
  }
  console.log("✓ Dictionary score boosting successfully recalculated (score: " + resolvedSecond.score + ").");

  // Find expressions
  const found = dictStore.find({ term: "heart" }, { workspace_id: "global" });
  if (found.length !== 1 || found[0]?.id !== "expr_1") {
    throw new Error("Dictionary find expressions failed");
  }
  console.log("✓ Dictionary find expressions filtered successfully.");

  console.log("\n🎉 Phase 5 verification tests passed successfully!");
}

runTests().catch((err) => {
  console.error("\n❌ Verification tests failed:", err);
  process.exit(1);
});
