import { describe, expect, it } from "bun:test";
import type { DictionaryStore } from "@stateful-mcp/core";
import {
	createEventStore,
	EventStore,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { KvCellStore } from "../src/cells/kv-cell-store";
import { ClinicalEngineBuilder } from "../src/engine/clinical-engine-v2-builder";
import type { MacroStore } from "../src/macros/macro-definition";
import { SchemaRegistry } from "../src/schemas/schema-registry";
import { KvWorkspaceStore } from "../src/workspaces/kv-workspace-store";

describe("ClinicalEngineBuilder", () => {
	it("rejects an incomplete composition instead of installing placeholders", () => {
		expect(() => new ClinicalEngineBuilder().build()).toThrow(/EventStore/);
	});

	it("builds a typed in-memory composition when all required dependencies are supplied", async () => {
		const eventStorage = await createEventStore(new SimpleMemoryKvBackend());
		const eventStore = new EventStore({
			session: eventStorage,
			persistent: eventStorage,
			schemas: new Map(),
		});
		const macroStore: MacroStore = {
			get: async () => null,
			list: async () => [],
		};
		const dictionaryStore = {} as DictionaryStore;
		const engine = new ClinicalEngineBuilder()
			.withEventStore(eventStore)
			.withSchemaRegistry(new SchemaRegistry())
			.withMacroStore(macroStore)
			.withDictionary(dictionaryStore)
			.withWorkspaceStore(new KvWorkspaceStore(new MemoryKvBackend()))
			.withCellStore(new KvCellStore(new MemoryKvBackend()))
			.withCellCompiler(async () => ({
				diagnostics: [],
				fingerprint: "empty-plan",
			}))
			.build();

		expect(engine).toBeDefined();
	});
});
