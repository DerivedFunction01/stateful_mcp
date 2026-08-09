import { describe, expect, it } from "bun:test";

import {
	DictionaryStore,
	InMemoryConceptFilterStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { initializeColdStart } from "../src/bootstrap/cold-start";
import { KvMacroStore } from "../src/macros/kv-macro-store";

describe(" cold start", () => {
	it("seeds schemas, concepts, macros, and separate temporal profile", async () => {
		const conceptFilterStore = new InMemoryConceptFilterStore();
		const state = await initializeColdStart({
			dictionary: new DictionaryStore(new InMemoryConceptResolver()),
			conceptFilterStore,
			macroStore: new KvMacroStore(new MemoryKvBackend()),
		});
		expect(state.schemaRegistry.get("PrimaryDiagnosis", 1)).not.toBeNull();
		expect(await state.dictionary.search("Pneumonia")).toHaveLength(1);
		expect(
			await conceptFilterStore.listForConceptRole(
				"c-pneumonia",
				"ObservationEvent.concept",
			),
		).toHaveLength(1);
		expect(state.commandProfile.directCommandToken).toBe(":");
		expect((await state.macroStore.get("primary_diagnosis"))?.active).toBe(
			true,
		);
	});
});
