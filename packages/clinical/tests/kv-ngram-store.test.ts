import { describe, expect, it } from "bun:test";
import type { KvBackend } from "@stateful-mcp/core";
import { KvNgramStore } from "../src/learning/autocomplete/kv-ngram-store";
import type { AutocompleteSuggestionKind } from "../src/stores/auto-complete/interfaces";

class CountingKvBackend implements KvBackend {
	data: Record<string, unknown> = {};
	loadCount = 0;
	saveCount = 0;

	async load(): Promise<Record<string, unknown>> {
		this.loadCount += 1;
		return { ...this.data };
	}

	async set(key: string, value: unknown): Promise<void> {
		this.data[key] = value;
	}

	async delete(key: string): Promise<void> {
		delete this.data[key];
	}

	async save(): Promise<void> {
		this.saveCount += 1;
	}
}

const kind: AutocompleteSuggestionKind = "cell_command";

describe("KvNgramStore", () => {
	it("loads once and serves repeated suggestions from its cache", async () => {
		const backend = new CountingKvBackend();
		const store = new KvNgramStore(backend);

		await store.increment("shortness", 1, kind);
		await store.suggest("short");
		await store.getTopByKind(kind);

		expect(backend.loadCount).toBe(1);
		expect(backend.saveCount).toBe(0);
	});

	it("serializes increments and exposes an explicit reload boundary", async () => {
		const backend = new CountingKvBackend();
		const store = new KvNgramStore(backend);

		await Promise.all([
			store.increment("shortness", 1, kind),
			store.increment("shortness", 1, kind),
		]);
		const beforeReload = await store.suggest("short");
		expect(beforeReload[0]?.frequency).toBe(2);

		backend.data["ngram:text:1:external"] = {
			ngram: "external",
			n: 1,
			kind,
			frequency: 3,
			lastUpdatedAt: new Date().toISOString(),
		};
		await store.reload();

		const afterReload = await store.suggest("external");
		expect(afterReload[0]?.ngram).toBe("external");
		expect(backend.loadCount).toBe(2);
	});
});
