import { describe, expect, it } from "bun:test";

import {
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { initializeColdStart } from "../src/bootstrap/cold-start";
import { KvMacroStore } from "../src/macros/kv-macro-store";

describe(" cold start", () => {
	it("seeds schemas, concepts, filters, macros, and separate temporal profile", async () => {
		const state = await initializeColdStart({
			dictionary: new DictionaryStore(new InMemoryConceptResolver()),
			macroStore: new KvMacroStore(new MemoryKvBackend()),
		});
		expect(state.schemaRegistry.get("PrimaryDiagnosis", 1)).not.toBeNull();
		expect(await state.dictionary.search("Pneumonia")).toHaveLength(1);
		expect(state.dictionary.getAllowedTargetAssignments?.()).toContain(
			"PrimaryDiagnosis.diagnosis",
		);
		expect(state.commandProfile.directCommandToken).toBe(":");
		expect(state.temporalProfile.relativeDayAliases.today).toBe(0);
		expect((await state.macroStore.get("primary_diagnosis"))?.active).toBe(
			true,
		);
	});
});
