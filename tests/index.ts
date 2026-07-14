import { loadMiddlewareConfig, resolveAdapter } from "../src/config/loader";
import { validateMiddlewareConfig } from "../src/config/validator";
import { MemorySessionFilterStore, MemoryPersistentFilterStore } from "../src/adapters/storage/memory-repo";
import { MemoryQueryEngine } from "../src/adapters/engines/memory-query";
import { FilterStore } from "../src/middleware/filter/store";
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
      operators: ["eq", "neq", "lt", "gt"]
    }
  });

  const pinnedSchemas = new Map<string, TableSchema>();
  const filterStore = new FilterStore(sessionStore, persistentStore, toolSchemas, pinnedSchemas);

  // Initialize and build a hierarchical chain
  const fInit = await filterStore.init("session_123", "browse_catalog", "items");
  const fAdded1 = await filterStore.add(fInit, [{ property: "category", operator: "eq", value: "apparel" }], "session_123");
  const fAdded2 = await filterStore.add(fAdded1, [{ property: "price", operator: "lt", value: 100 }], "session_123");

  const rulesChain = await filterStore.getFilterRules(fAdded2, "session_123");
  if (rulesChain.length !== 2) {
    throw new Error(`Hierarchy rule traversal failed. Rules count: ${rulesChain.length}`);
  }
  console.log("✓ Filter hierarchy creation and rule traversal works.");

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

  console.log("\n🎉 Phase 1 verification tests passed successfully!");
}

runTests().catch((err) => {
  console.error("\n❌ Verification tests failed:", err);
  process.exit(1);
});
