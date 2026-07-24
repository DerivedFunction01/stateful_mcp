import { describe, expect, it } from "bun:test";
import {
	buildSequenceSignature,
	extractAdjacentPairs,
	scoreAdjacentPairs,
	scoreRelations,
	scoreSequenceSignature,
} from "../src/store/ordered-learning-ranking-types";
import {
	buildOrderedRelations,
	CompositeOrderedLearningStore,
	MAX_ORDERED_TOKENS,
	MemoryOrderedLearningStore,
	NEAR_GAP_THRESHOLD,
	type OrderedLearningHistoryKey,
	type OrderedLearningRecordInput,
	type OrderedLearningStoreAdapter,
	type OrderedLearningToken,
} from "../src/store/ordered-learning-store";

function makeInput(
	overrides?: Partial<OrderedLearningRecordInput>,
): OrderedLearningRecordInput {
	return {
		shared: {
			cellId: "cell_001",
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation mild dyspnea for 2 days",
			patientId: "pat_001",
			personnelId: "dr_smith",
			specialtyId: "cardiology",
			acceptedAt: new Date().toISOString(),
			...overrides?.shared,
		},
		parsedItem: {
			tag: "#observation",
			anchorText: "mild dyspnea for 2 days",
			conceptId: "SNOMED::267036007",
			display: "Dyspnea",
			severity: "mild",
			targetSchema: "ObservationEvent",
			rawText: "#observation mild dyspnea for 2 days",
		},
		orderedTokens: [
			{ kind: "tag", key: "#observation", index: 0 },
			{ kind: "concept", key: "SNOMED::267036007", value: "Dyspnea", index: 1 },
			{ kind: "field", key: "severity", value: "mild", index: 2 },
			{ kind: "field", key: "duration", value: "2 days", index: 3 },
		],
		...overrides,
	};
}

function makeKey(
	overrides?: Partial<OrderedLearningHistoryKey>,
): OrderedLearningHistoryKey {
	return {
		tag: "#observation",
		targetSchema: "ObservationEvent",
		rawText: "#observation mild dyspnea for 2 days",
		patientId: "pat_001",
		personnelId: "dr_smith",
		specialtyId: "cardiology",
		...overrides,
	};
}

// ── MemoryOrderedLearningStore tests ─────────────────────────────────────────

describe("MemoryOrderedLearningStore", () => {
	it("should store and retrieve an ordered observation", async () => {
		const store = new MemoryOrderedLearningStore();
		const input = makeInput();
		await store.putOrderedObservation(input);

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].cellId).toBe("cell_001");
		expect(results[0].orderedTokens).toHaveLength(4);
		expect(results[0].orderedTokens[0].kind).toBe("tag");
		expect(results[0].orderedTokens[1].kind).toBe("concept");
		expect(results[0].orderedTokens[2].kind).toBe("field");
		expect(results[0].orderedTokens[3].kind).toBe("field");
	});

	it("should return empty array when no records match", async () => {
		const store = new MemoryOrderedLearningStore();
		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(0);
	});

	it("should filter by patientId", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());

		const results = await store.getOrderedObservationHistory(
			makeKey({ patientId: "pat_999" }),
		);
		expect(results).toHaveLength(0);
	});

	it("should filter by personnelId", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());

		const results = await store.getOrderedObservationHistory(
			makeKey({ personnelId: "dr_jones" }),
		);
		expect(results).toHaveLength(0);
	});

	it("should filter by rawText", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());

		const results = await store.getOrderedObservationHistory(
			makeKey({ rawText: "different text" }),
		);
		expect(results).toHaveLength(0);
	});

	it("should increment priorAcceptCount on repeated puts", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());
		await store.putOrderedObservation(makeInput());

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].history?.priorAcceptCount).toBe(2);
	});

	it("should mark correction and update flags", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());

		await store.markOrderedObservationCorrection("cell_001");
		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].history?.priorCorrectionCount).toBe(1);
		expect(results[0].flags?.stalePreference).toBe(true);
		expect(results[0].flags?.reviewRequired).toBe(false);
	});

	it("should mark correction with replacement and set reviewRequired", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());

		await store.markOrderedObservationCorrection("cell_001", {
			tag: "#observation",
			anchorText: "severe dyspnea for 3 days",
			conceptId: "SNOMED::267036007",
			display: "Dyspnea",
			severity: "severe",
			targetSchema: "ObservationEvent",
			rawText: "#observation severe dyspnea for 3 days",
		});
		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].history?.priorCorrectionCount).toBe(1);
		expect(results[0].flags?.reviewRequired).toBe(true);
		expect(results[0].parsedItem.severity).toBe("severe");
	});

	it("should bound ordered tokens to MAX_ORDERED_TOKENS", async () => {
		const store = new MemoryOrderedLearningStore();
		const manyTokens: OrderedLearningToken[] = Array.from(
			{ length: MAX_ORDERED_TOKENS + 100 },
			(_, i) => ({
				kind: "field" as const,
				key: `token_${i}`,
				value: `val_${i}`,
				index: i,
			}),
		);
		await store.putOrderedObservation(makeInput({ orderedTokens: manyTokens }));

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].orderedTokens).toHaveLength(MAX_ORDERED_TOKENS);
	});

	it("should sort results by recencyScore descending", async () => {
		const store = new MemoryOrderedLearningStore();
		const oldDate = new Date(Date.now() - 7 * 86_400_000).toISOString();

		await store.putOrderedObservation(
			makeInput({
				shared: {
					cellId: "cell_old",
					tag: "#observation",
					targetSchema: "ObservationEvent",
					rawText: "#observation mild dyspnea for 2 days",
					patientId: "pat_001",
					personnelId: "dr_smith",
					specialtyId: "cardiology",
					acceptedAt: oldDate,
				},
			}),
		);
		await store.putOrderedObservation(
			makeInput({
				shared: {
					cellId: "cell_new",
					tag: "#observation",
					targetSchema: "ObservationEvent",
					rawText: "#observation mild dyspnea for 2 days",
					patientId: "pat_001",
					personnelId: "dr_smith",
					specialtyId: "cardiology",
					acceptedAt: new Date().toISOString(),
				},
			}),
		);

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(2);
		expect(results[0].cellId).toBe("cell_new");
		expect(results[1].cellId).toBe("cell_old");
	});

	it("should not fail on markOrderedObservationCorrection for unknown cellId", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.markOrderedObservationCorrection("nonexistent");
		expect(true).toBe(true);
	});

	it("should store featureBag when provided", async () => {
		const store = new MemoryOrderedLearningStore();
		const input = makeInput();
		input.shared = {
			...input.shared,
			patientAgeBucket: "adult",
			patientGender: "male",
			patientSpeciesBucket: "human",
			patientSubBucket: 1,
			patientBucketKey: "human:adult:male",
		};
		await store.putOrderedObservation(input);

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].patientAgeBucket).toBe("adult");
		expect(results[0].patientGender).toBe("male");
		expect(results[0].patientSpeciesBucket).toBe("human");
		expect(results[0].patientSubBucket).toBe(1);
		expect(results[0].patientBucketKey).toBe("human:adult:male");
	});

	it("should derive pairwise relations on put", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(makeInput());

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].relations).toBeDefined();
		// 4 tokens => 6 pairs => 12 relations (before + after for each)
		expect(results[0].relations).toHaveLength(12);
	});

	it("should have empty relations for single token", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.putOrderedObservation(
			makeInput({
				orderedTokens: [{ kind: "tag", key: "#observation", index: 0 }],
			}),
		);

		const results = await store.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(1);
		expect(results[0].relations).toHaveLength(0);
	});
});

// ── buildOrderedRelations tests ──────────────────────────────────────────────

describe("buildOrderedRelations", () => {
	it("should return empty for fewer than 2 tokens", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "tag", key: "#obs", index: 0 },
		];
		const relations = buildOrderedRelations(tokens, "cell_001");
		expect(relations).toHaveLength(0);
	});

	it("should return empty for empty tokens", () => {
		const relations = buildOrderedRelations([], "cell_001");
		expect(relations).toHaveLength(0);
	});

	it("should produce before+after for each pair", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "field", key: "severity", index: 0 },
			{ kind: "field", key: "duration", index: 1 },
		];
		const relations = buildOrderedRelations(tokens, "cell_001");
		// 1 pair => 2 relations (before + after)
		expect(relations).toHaveLength(2);

		// gap=1 is classified as "adjacent" for i->j
		const adjacent = relations.find((r) => r.relationType === "adjacent");
		expect(adjacent).toBeDefined();
		expect(adjacent!.fromKey).toBe("severity");
		expect(adjacent!.toKey).toBe("duration");
		expect(adjacent!.tokenGap).toBe(1);
		expect(adjacent!.normalizedGap).toBe(1);

		// reverse direction is always "after"
		const after = relations.find((r) => r.relationType === "after");
		expect(after).toBeDefined();
		expect(after!.fromKey).toBe("duration");
		expect(after!.toKey).toBe("severity");
		expect(after!.tokenGap).toBe(1);
	});

	it("should classify adjacent pairs correctly", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "field", key: "a", index: 0 },
			{ kind: "field", key: "b", index: 1 },
			{ kind: "field", key: "c", index: 2 },
		];
		const relations = buildOrderedRelations(tokens, "cell_001");
		// 3 pairs => 6 relations
		expect(relations).toHaveLength(6);

		// a->b and b->c should be adjacent
		const aToB = relations.find((r) => r.fromKey === "a" && r.toKey === "b");
		expect(aToB).toBeDefined();
		expect(aToB!.relationType).toBe("adjacent");

		const bToC = relations.find((r) => r.fromKey === "b" && r.toKey === "c");
		expect(bToC).toBeDefined();
		expect(bToC!.relationType).toBe("adjacent");

		// a->c should be near (gap=2, which is <= NEAR_GAP_THRESHOLD)
		const aToC = relations.find((r) => r.fromKey === "a" && r.toKey === "c");
		expect(aToC).toBeDefined();
		expect(aToC!.relationType).toBe("near");
	});

	it("should classify far pairs correctly", () => {
		const tokens: OrderedLearningToken[] = Array.from(
			{ length: NEAR_GAP_THRESHOLD + 3 },
			(_, i) => ({
				kind: "field" as const,
				key: `token_${i}`,
				index: i,
			}),
		);
		const relations = buildOrderedRelations(tokens, "cell_001");

		// first and last should be far
		const firstToLast = relations.find(
			(r) =>
				r.fromKey === "token_0" &&
				r.toKey === `token_${NEAR_GAP_THRESHOLD + 2}`,
		);
		expect(firstToLast).toBeDefined();
		expect(firstToLast!.relationType).toBe("far");
		expect(firstToLast!.tokenGap).toBe(NEAR_GAP_THRESHOLD + 2);
	});

	it("should include exact tokenGap and normalizedGap", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "field", key: "a", index: 0 },
			{ kind: "field", key: "b", index: 1 },
			{ kind: "field", key: "c", index: 2 },
			{ kind: "field", key: "d", index: 3 },
		];
		const relations = buildOrderedRelations(tokens, "cell_001");

		const aToD = relations.find((r) => r.fromKey === "a" && r.toKey === "d");
		expect(aToD).toBeDefined();
		expect(aToD!.tokenGap).toBe(3);
		expect(aToD!.normalizedGap).toBeCloseTo(1, 5); // 3 / (4-1) = 1
	});
});

// ── CompositeOrderedLearningStore tests ──────────────────────────────────────

describe("CompositeOrderedLearningStore", () => {
	it("should merge results from multiple adapters", async () => {
		const store1 = new MemoryOrderedLearningStore();
		const store2 = new MemoryOrderedLearningStore();

		await store1.putOrderedObservation(
			makeInput({
				shared: { ...makeInput().shared, cellId: "cell_a" },
			}),
		);
		await store2.putOrderedObservation(
			makeInput({
				shared: { ...makeInput().shared, cellId: "cell_b" },
			}),
		);

		const adapters: OrderedLearningStoreAdapter[] = [
			{ adapterId: "mem1", weight: 0.5, store: store1 },
			{ adapterId: "mem2", weight: 0.5, store: store2 },
		];
		const composite = new CompositeOrderedLearningStore(adapters);

		const results = await composite.getOrderedObservationHistory(makeKey());
		expect(results).toHaveLength(2);
		const cellIds = results.map((r) => r.cellId).sort();
		expect(cellIds).toEqual(["cell_a", "cell_b"]);
	});

	it("should return weighted candidates", async () => {
		const store1 = new MemoryOrderedLearningStore();
		await store1.putOrderedObservation(makeInput());

		const adapters: OrderedLearningStoreAdapter[] = [
			{ adapterId: "mem1", weight: 0.7, store: store1 },
		];
		const composite = new CompositeOrderedLearningStore(adapters);

		const weighted = await composite.getWeightedOrderedObservationHistory(
			makeKey(),
		);
		expect(weighted).toHaveLength(1);
		expect(weighted[0].adapterId).toBe("mem1");
		expect(weighted[0].weight).toBe(0.7);
	});

	it("should fan out putOrderedObservation to all adapters", async () => {
		const store1 = new MemoryOrderedLearningStore();
		const store2 = new MemoryOrderedLearningStore();

		const adapters: OrderedLearningStoreAdapter[] = [
			{ adapterId: "mem1", weight: 0.5, store: store1 },
			{ adapterId: "mem2", weight: 0.5, store: store2 },
		];
		const composite = new CompositeOrderedLearningStore(adapters);

		await composite.putOrderedObservation(makeInput());

		const results1 = await store1.getOrderedObservationHistory(makeKey());
		const results2 = await store2.getOrderedObservationHistory(makeKey());
		expect(results1).toHaveLength(1);
		expect(results2).toHaveLength(1);
	});

	it("should fan out markOrderedObservationCorrection to all adapters", async () => {
		const store1 = new MemoryOrderedLearningStore();
		const store2 = new MemoryOrderedLearningStore();

		await store1.putOrderedObservation(makeInput());
		await store2.putOrderedObservation(makeInput());

		const adapters: OrderedLearningStoreAdapter[] = [
			{ adapterId: "mem1", weight: 0.5, store: store1 },
			{ adapterId: "mem2", weight: 0.5, store: store2 },
		];
		const composite = new CompositeOrderedLearningStore(adapters);

		await composite.markOrderedObservationCorrection("cell_001");

		const results1 = await store1.getOrderedObservationHistory(makeKey());
		const results2 = await store2.getOrderedObservationHistory(makeKey());
		expect(results1[0].history?.priorCorrectionCount).toBe(1);
		expect(results2[0].history?.priorCorrectionCount).toBe(1);
	});

	it("should return empty when no adapters match", async () => {
		const store1 = new MemoryOrderedLearningStore();
		await store1.putOrderedObservation(makeInput());

		const adapters: OrderedLearningStoreAdapter[] = [
			{ adapterId: "mem1", weight: 1, store: store1 },
		];
		const composite = new CompositeOrderedLearningStore(adapters);

		const results = await composite.getOrderedObservationHistory(
			makeKey({ patientId: "nonexistent" }),
		);
		expect(results).toHaveLength(0);
	});
});

// ── Ranking type helper tests ────────────────────────────────────────────────

describe("extractAdjacentPairs", () => {
	it("should extract pairs from token sequence", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "tag", key: "#observation", index: 0 },
			{ kind: "concept", key: "SNOMED::267036007", index: 1 },
			{ kind: "field", key: "severity", index: 2 },
		];
		const pairs = extractAdjacentPairs(tokens);
		expect(pairs).toHaveLength(2);
		expect(pairs[0]).toEqual(["tag:#observation", "concept:SNOMED::267036007"]);
		expect(pairs[1]).toEqual(["concept:SNOMED::267036007", "field:severity"]);
	});

	it("should return empty for single token", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "tag", key: "#obs", index: 0 },
		];
		expect(extractAdjacentPairs(tokens)).toHaveLength(0);
	});

	it("should return empty for empty tokens", () => {
		expect(extractAdjacentPairs([])).toHaveLength(0);
	});
});

describe("buildSequenceSignature", () => {
	it("should build signature from tokens", () => {
		const tokens: OrderedLearningToken[] = [
			{ kind: "tag", key: "#observation", index: 0 },
			{ kind: "concept", key: "SNOMED::267036007", index: 1 },
			{ kind: "field", key: "severity", index: 2 },
		];
		const sig = buildSequenceSignature(tokens);
		expect(sig).toBe(
			"tag:#observation->concept:SNOMED::267036007|concept:SNOMED::267036007->field:severity",
		);
	});

	it("should produce stable signatures for same sequence", () => {
		const tokens1: OrderedLearningToken[] = [
			{ kind: "field", key: "a", index: 0 },
			{ kind: "field", key: "b", index: 1 },
		];
		const tokens2: OrderedLearningToken[] = [
			{ kind: "field", key: "a", index: 0 },
			{ kind: "field", key: "b", index: 1 },
		];
		expect(buildSequenceSignature(tokens1)).toBe(
			buildSequenceSignature(tokens2),
		);
	});
});

describe("scoreAdjacentPairs", () => {
	it("should return 1 for perfect match", () => {
		const pairs: Array<[string, string]> = [["tag:#obs", "field:severity"]];
		expect(scoreAdjacentPairs(pairs, pairs)).toBe(1);
	});

	it("should return 0 for no match", () => {
		const candidate: Array<[string, string]> = [["tag:#obs", "field:severity"]];
		const history: Array<[string, string]> = [["tag:#obs", "field:duration"]];
		expect(scoreAdjacentPairs(candidate, history)).toBe(0);
	});

	it("should return partial match fraction", () => {
		const candidate: Array<[string, string]> = [
			["tag:#obs", "field:a"],
			["field:a", "field:b"],
		];
		const history: Array<[string, string]> = [
			["tag:#obs", "field:a"],
			["field:a", "field:c"],
		];
		expect(scoreAdjacentPairs(candidate, history)).toBe(0.5);
	});

	it("should return 0 for empty candidate", () => {
		expect(scoreAdjacentPairs([], [["a", "b"]])).toBe(0);
	});
});

describe("scoreRelations", () => {
	it("should return 1 for perfect match", () => {
		const relations = [
			{
				cellId: "c1",
				fromKey: "a",
				toKey: "b",
				fromKind: "field" as const,
				toKind: "field" as const,
				relationType: "adjacent" as const,
				tokenGap: 1,
				normalizedGap: 0.5,
			},
		];
		expect(scoreRelations(relations, relations)).toBe(1);
	});

	it("should return 0 for no match", () => {
		const candidate = [
			{
				cellId: "c1",
				fromKey: "a",
				toKey: "b",
				fromKind: "field" as const,
				toKind: "field" as const,
				relationType: "adjacent" as const,
				tokenGap: 1,
				normalizedGap: 0.5,
			},
		];
		const history = [
			{
				cellId: "c2",
				fromKey: "a",
				toKey: "c",
				fromKind: "field" as const,
				toKind: "field" as const,
				relationType: "adjacent" as const,
				tokenGap: 1,
				normalizedGap: 0.5,
			},
		];
		expect(scoreRelations(candidate, history)).toBe(0);
	});

	it("should return 0 for empty candidate", () => {
		expect(scoreRelations([], [{} as any])).toBe(0);
	});
});

describe("scoreSequenceSignature", () => {
	it("should return 1 for exact match", () => {
		expect(scoreSequenceSignature("a->b", ["a->b", "c->d"])).toBe(0.5);
	});

	it("should return 0 for no match", () => {
		expect(scoreSequenceSignature("a->b", ["c->d"])).toBe(0);
	});

	it("should return 0 for empty history", () => {
		expect(scoreSequenceSignature("a->b", [])).toBe(0);
	});
});
