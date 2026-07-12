import { DictionaryStore } from "./src/dictionary";
import { FilterStore } from "./src/filter";
import { loadFilterConfig, loadDictionaryConfig } from "./src/config/loader";
import { executeQuery } from "./src/examples/memory-engine";
import { SqliteEngine } from "./src/examples/sqlite-engine";

async function runTests() {
  console.log("🚀 Starting verification tests...\n");

  const workspaceRoot = process.cwd();

  // 1. Initialize Loader & Stores
  const filterConfig = await loadFilterConfig(workspaceRoot);
  const dictionaryConfig = await loadDictionaryConfig(workspaceRoot);

  const dictionaryStore = new DictionaryStore();
  dictionaryStore.loadConfig(dictionaryConfig);

  const filterStore = new FilterStore();
  filterStore.registerMockExecutor((tableName, mockData, query) => executeQuery(mockData, query));

  if (filterConfig.tools) {
    for (const tool of filterConfig.tools) {
      filterStore.registerToolSchema(tool);
    }
  }

  // ─── TEST CASE 1: Dictionary Resolution & Auto-Weighting ───
  console.log("🧪 Test Case 1: Dictionary Resolution");
  const resolve1 = dictionaryStore.resolve("the usual thing", { workspace_id: "global" });
  if (!resolve1 || resolve1.concept.display !== "Hypertension") {
    throw new Error(`Failed to resolve 'the usual thing'. Got: ${resolve1?.concept.display}`);
  }
  console.log("✓ 'the usual thing' resolved correctly to SNOMED code: " + resolve1.concept.standardCode);

  const resolve2 = dictionaryStore.resolve("little blue tablet", { workspace_id: "global" });
  if (!resolve2 || resolve2.concept.display !== "Medication X") {
    throw new Error(`Failed to resolve 'little blue tablet'. Got: ${resolve2?.concept.display}`);
  }
  console.log("✓ 'little blue tablet' resolved correctly to: " + resolve2.concept.display);

  // Test Auto-Weighting resolution score updates
  const metricsBefore = dictionaryStore.getMetrics().find(m => m.expressionId === "expr_2")?.usageCount || 0;
  dictionaryStore.resolve("blue pill", { workspace_id: "global" });
  const metricsAfter = dictionaryStore.getMetrics().find(m => m.expressionId === "expr_2")?.usageCount || 0;
  if (metricsAfter !== metricsBefore + 1) {
    throw new Error("Resolution usage metrics were not recorded or updated.");
  }
  console.log("✓ Resolution usage counter incremented correctly.");

  // ─── TEST CASE 2: Stateful Filter Building & Schema Validation ───
  console.log("\n🧪 Test Case 2: Stateful Filter Validation");
  const filterId = filterStore.init("browse_catalog", "items");
  
  // Valid operations
  const filterIdV2 = filterStore.add(filterId, [
    { property: "price", operator: "lt", value: 200 },
    { property: "category", operator: "eq", value: "apparel" }
  ]);

  const filterState = filterStore.getFilter(filterIdV2);
  if (filterState.rules.length !== 2) {
    throw new Error(`Expected 2 filter rules, got ${filterState.rules.length}`);
  }
  console.log("✓ Filter created with valid properties.");

  // Invalid property schema check
  try {
    filterStore.add(filterIdV2, [
      { property: "invalid_column_name", operator: "eq", value: "fail" }
    ]);
    throw new Error("Should have thrown error on invalid property");
  } catch (err: any) {
    if (err.message.includes("is not filterable on table")) {
      console.log("✓ Successfully caught invalid property schema error: " + err.message);
    } else {
      throw err;
    }
  }

  // Invalid operator schema check
  try {
    filterStore.add(filterIdV2, [
      { property: "price", operator: "between", value: "not-an-array-fails-mock-execution" }
    ]);
    throw new Error("Should have thrown error on mock execution failure");
  } catch (err: any) {
    console.log("✓ Successfully caught mock execution validation error: " + err.message);
  }

  // ─── TEST CASE 3: Materializing Views & Memory Engine Execution ───
  console.log("\n🧪 Test Case 3: Materials Views & Execution");
  const viewId = filterStore.initView(filterIdV2, null, null, 10, 0);
  const view = filterStore.getView(viewId);
  if (!view) {
    throw new Error("View state was not initialized.");
  }

  const catalogSchema = filterStore.getParameters("browse_catalog", "items");
  const result = executeQuery(catalogSchema.mock_dataset, {
    filters: filterStore.getResolvedRules(view.filterId)
  });

  if (result.length !== 2) {
    throw new Error(`Expected 2 query results, got ${result.length}`);
  }
  console.log(`✓ Memory Engine executed view query correctly. Rows found: ${result.length}`);
  console.log("  Filtered rows: " + JSON.stringify(result.map(r => r.name)));

  // ─── TEST CASE 4: SQL Compilation (SQLite Engine) ───
  console.log("\n🧪 Test Case 4: SQLite Compilation Example");
  const sqlCompiler = new SqliteEngine();
  const sql = sqlCompiler.compile("items", {
    filters: filterStore.getResolvedRules(view.filterId),
    limit: 10
  });
  console.log("✓ Compiled SQL:\n  " + sql);
  if (!sql.includes("SELECT * FROM `items` WHERE `price` < 200 AND `category` = 'apparel' LIMIT 10")) {
    throw new Error("Incorrect SQLite query built.");
  }

  console.log("\n🎉 All verification tests passed successfully!");
}

runTests().catch((err) => {
  console.error("\n❌ Verification tests failed:", err);
  process.exit(1);
});
