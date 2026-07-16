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
}
