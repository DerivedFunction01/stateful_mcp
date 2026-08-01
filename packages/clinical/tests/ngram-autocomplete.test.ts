import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvNgramStore } from "../src/store/learning/autocomplete/kv-ngram-store";
import { extractNgrams } from "../src/parser/utils/ngram-extractor";

describe("KvNgramStore", () => {
	function makeStore(): KvNgramStore {
		return new KvNgramStore(new MemoryKvBackend());
	}

	it("increment creates a new record with frequency 1", async () => {
		const store = makeStore();
		await store.increment("chest pain", 2, "prose");
		const results = await store.suggest("che");
		expect(results).toHaveLength(1);
		expect(results[0]!.ngram).toBe("chest pain");
		expect(results[0]!.frequency).toBe(1);
	});

	it("increment bumps frequency on existing record", async () => {
		const store = makeStore();
		await store.increment("fever", 1, "prose");
		await store.increment("fever", 1, "prose");
		await store.increment("fever", 1, "prose");
		const results = await store.suggest("fe");
		expect(results).toHaveLength(1);
		expect(results[0]!.frequency).toBe(3);
	});

	it("suggest returns prefix-matched results sorted by frequency", async () => {
		const store = makeStore();
		await store.increment("shoulder", 1, "prose");
		await store.increment("sharp", 1, "prose");
		await store.increment("sharp", 1, "prose");
		await store.increment("shortness of breath", 3, "prose");

		const results = await store.suggest("sh");
		expect(results.length).toBeGreaterThanOrEqual(2);
		// Most frequent should be first
		expect(results[0]!.ngram).toBe("sharp");
	});

	it("suggest is case-insensitive", async () => {
		const store = makeStore();
		await store.increment("Chest Pain", 2, "prose");
		const results = await store.suggest("che");
		expect(results).toHaveLength(1);
		expect(results[0]!.ngram).toBe("chest pain");
	});

	it("getTopByKind returns only matching kind", async () => {
		const store = makeStore();
		await store.increment("fever", 1, "prose");
		await store.increment("observation", 1, "tag");
		await store.increment("vital", 1, "tag");

		const tags = await store.getTopByKind("tag");
		expect(tags).toHaveLength(2);
		expect(tags.every((r) => r.kind === "tag")).toBe(true);

		const prose = await store.getTopByKind("prose");
		expect(prose).toHaveLength(1);
	});

	it("returns empty array for non-matching prefix", async () => {
		const store = makeStore();
		await store.increment("fever", 1, "prose");
		const results = await store.suggest("xyz");
		expect(results).toEqual([]);
	});

	it("returns empty array from empty store", async () => {
		const store = makeStore();
		expect(await store.suggest("a")).toEqual([]);
		expect(await store.getTopByKind("prose")).toEqual([]);
	});
});

describe("extractNgrams", () => {
	it("extracts uni-grams from text", () => {
		const results = extractNgrams("patient presents with fever");
		const unigrams = results.filter((r) => r.n === 1);
		expect(unigrams.length).toBeGreaterThanOrEqual(3);
		expect(unigrams.find((r) => r.ngram === "fever")).toBeDefined();
	});

	it("extracts bi-grams from text", () => {
		const results = extractNgrams("chest pain");
		const bigrams = results.filter((r) => r.n === 2);
		expect(bigrams).toHaveLength(1);
		expect(bigrams[0]!.ngram).toBe("chest pain");
	});

	it("extracts tri-grams from text", () => {
		const results = extractNgrams("sharp chest pain");
		const trigrams = results.filter((r) => r.n === 3);
		expect(trigrams).toHaveLength(1);
		expect(trigrams[0]!.ngram).toBe("sharp chest pain");
	});

	it("filters out n-grams shorter than 2 characters", () => {
		const results = extractNgrams("a b c d");
		expect(results).toHaveLength(0);
	});

	it("assigns the specified kind to all n-grams", () => {
		const results = extractNgrams("chest pain", "tag");
		expect(results.every((r) => r.kind === "tag")).toBe(true);
	});

	it("deduplicates within the same call", () => {
		const results = extractNgrams("pain pain pain");
		const unigrams = results.filter((r) => r.n === 1);
		expect(unigrams).toHaveLength(1);
	});

	it("passes through template context", () => {
		const results = extractNgrams("chest pain", "prose", {
			templateId: "tpl_hpi",
			slotName: "symptom",
		});
		expect(results.every((r) => r.templateId === "tpl_hpi")).toBe(true);
		expect(results.every((r) => r.slotName === "symptom")).toBe(true);
	});

	it("handles empty text", () => {
		const results = extractNgrams("");
		expect(results).toEqual([]);
	});

	it("handles text with punctuation", () => {
		const results = extractNgrams("chest pain. fever; cough");
		const ngrams = results.map((r) => r.ngram);
		expect(ngrams).toContain("chest pain");
		expect(ngrams).toContain("fever");
		expect(ngrams).toContain("cough");
	});
});
