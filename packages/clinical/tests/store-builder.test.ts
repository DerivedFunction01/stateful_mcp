import { describe, expect, it } from "bun:test";
import {
	createStoreBuilder,
	StoreBuilder,
} from "../src/bootstrap/store-builder";

describe(" store builder", () => {
	it("creates the complete memory composition", async () => {
		const stores = await StoreBuilder.withDefaultBackend("memory");
		expect(stores.eventStore).toBeDefined();
		expect(stores.workspaceStore).toBeDefined();
		expect(stores.cellStore).toBeDefined();
		expect(stores.notebookSessionStore).toBeDefined();
		expect(stores.macroStore).toBeDefined();
		expect(stores.journal).toBeDefined();
		expect(stores.projectionStore).toBeDefined();
		expect(stores.archiveStore).toBeDefined();
	});

	it("supports explicit backend configuration", async () => {
		const stores = await createStoreBuilder({
			backend: "sqlite",
			dbPath: `/tmp/kilo/clinical-store-builder-${Date.now()}.sqlite`,
		});
		expect(stores.eventStore).toBeDefined();
		expect(stores.workspaceStore).toBeDefined();
	});
});
