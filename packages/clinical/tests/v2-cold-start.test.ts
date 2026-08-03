import { describe, expect, it } from "bun:test";
import { DictionaryStore } from "@stateful-mcp/core/middleware/dictionary/store";
import { InMemoryConceptResolver } from "@stateful-mcp/core/middleware/dictionary/resolver";
import { KvMacroStore } from "../src/v2/macros/kv-macro-store";
import { initializeV2ColdStart } from "../src/v2/bootstrap/v2-cold-start";
import { MemoryKvBackend } from "@stateful-mcp/core";

describe("V2 cold start", () => {
	it("seeds schemas, concepts, filters, macros, and separate temporal profile", async () => {
		const state = await initializeV2ColdStart({ dictionary: new DictionaryStore(new InMemoryConceptResolver()), macroStore: new KvMacroStore(new MemoryKvBackend()) });
		expect(state.schemaRegistry.get("PrimaryDiagnosis", 1)).not.toBeNull();
		expect(await state.dictionary.search("Pneumonia")).toHaveLength(1);
		expect(state.dictionary.getAllowedTargetAssignments?.()).toContain("PrimaryDiagnosis.diagnosis");
		expect(state.commandProfile.directCommandToken).toBe(":");
		expect(state.temporalProfile.relativeDayAliases.today).toBe(0);
		expect((await state.macroStore.get("primary_diagnosis"))?.active).toBe(true);
	});
});
