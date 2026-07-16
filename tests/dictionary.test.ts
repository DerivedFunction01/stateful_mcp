import { DictionaryStore } from "../src/middleware/dictionary/store";
import { InMemoryConceptResolver } from "../src/middleware/dictionary/resolver";

export async function runDictionaryTests() {
  console.log("\n🧪 Test Case 8: Dictionary Service");

  const resolver = new InMemoryConceptResolver();
  const dictStore = new DictionaryStore(resolver);

  // Load sample dictionary config
  dictStore.loadConfig({
    namespaces: [
      { code: "SNOMED", isPublic: true, isExternalPrivate: false }
    ],
    concepts: [
      { id: "c_mi", namespaceCode: "SNOMED", standardCode: "I21.9", display: "Myocardial Infarction", description: "A blockage of blood flow to the heart muscle." }
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
    ],
    allowedTargetAssignments: ["MAIN_TERM", "METRIC"]
  });

  // Verify Concept description is loaded
  const concept = dictStore.getConcept("c_mi");
  if (!concept || concept.description !== "A blockage of blood flow to the heart muscle.") {
    throw new Error("Concept description was not loaded correctly");
  }
  console.log("✓ Dictionary successfully loaded concept description.");

  // Verify allowedTargetAssignments validation
  try {
    dictStore.addExpression({
      term: "unsupported assignment test",
      regexPattern: "test",
      isCaseInsensitive: true,
      targetAssignment: "UNSUPPORTED",
      conceptId: "c_mi",
      priorityWeight: 1,
      active: true
    });
    throw new Error("Should have thrown error on unsupported target assignment");
  } catch (err: any) {
    if (!err.message.includes("is not in the allowed list of assignments")) {
      throw err;
    }
  }
  console.log("✓ Dictionary successfully validated targetAssignment against allowed list.");

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

  // Test Case 9: Multi-Backend Weighted Concept Resolution
  console.log("\n🧪 Test Case 9: Multi-Backend Weighted Concept Resolution");
  
  const personalBackend = {
    config: { id: "personal", defaultWeight: 0.8, minWeight: 0.1, maxWeight: 1.0 },
    currentWeight: 0.8,
    resolver: new InMemoryConceptResolver(),
    concepts: new Map([["p_c_mi", { id: "p_c_mi", namespaceCode: "CUSTOM", standardCode: "P-I21.9", display: "Myocardial Infarction (Personal)" }]]),
    expressions: [{ id: "p_expr", term: "heart attack", regexPattern: "\\bheart\\s+attack\\b", isCaseInsensitive: true, targetAssignment: "MAIN_TERM", conceptId: "p_c_mi", priorityWeight: 5, active: true }],
    metrics: []
  };

  const globalBackend = {
    config: { id: "global_backend", defaultWeight: 0.3, minWeight: 0.05, maxWeight: 0.5 },
    currentWeight: 0.3,
    resolver: new InMemoryConceptResolver(),
    concepts: new Map([["g_c_mi", { id: "g_c_mi", namespaceCode: "SNOMED", standardCode: "I21.9", display: "Myocardial Infarction (Global)" }]]),
    expressions: [{ id: "g_expr", term: "heart attack", regexPattern: "\\bheart\\s+attack\\b", isCaseInsensitive: true, targetAssignment: "MAIN_TERM", conceptId: "g_c_mi", priorityWeight: 5, active: true }],
    metrics: []
  };

  const { MultiBackendConceptResolver } = require("../src/middleware/dictionary/resolver");
  const multiResolver = new MultiBackendConceptResolver([personalBackend, globalBackend]);
  const multiStore = new DictionaryStore(multiResolver);

  // Initial resolution - Personal should win (weighted score: 5 * 0.8 = 4 vs Global: 5 * 0.3 = 1.5)
  const multiRes = await multiStore.resolve("heart attack");
  if (!multiRes || multiRes.conceptId !== "p_c_mi") {
    throw new Error(`Multi-backend resolution failed. Expected p_c_mi, got: ${multiRes?.conceptId}`);
  }
  console.log("✓ Multi-backend resolved to the higher-weighted Personal backend candidate.");

  // Verify weights got updated (Personal rewarded +0.05 -> 0.85, Global decayed -0.01 -> 0.29)
  const backends = multiResolver.getBackends();
  const personal = backends.find((b: any) => b.config.id === "personal");
  const globalB = backends.find((b: any) => b.config.id === "global_backend");

  if (!personal || personal.currentWeight !== 0.85) {
    throw new Error(`Personal weight adjustment failed. Expected 0.85, got: ${personal?.currentWeight}`);
  }
  if (!globalB || globalB.currentWeight !== 0.29) {
    throw new Error(`Global weight adjustment failed. Expected 0.29, got: ${globalB?.currentWeight}`);
  }
  console.log("✓ Multi-backend weights adjusted successfully (winner rewarded, losers decayed).");
}
