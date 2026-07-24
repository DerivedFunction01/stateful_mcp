import { describe, expect, it } from "bun:test";
import {
	MemoryOrderedLearningStore,
	type OrderedLearningHistoryKey,
	type OrderedLearningRecordInput,
	type OrderedLearningToken,
	MAX_ORDERED_TOKENS,
} from "../src/store/ordered-learning-store";

function makeInput(overrides?: Partial<OrderedLearningRecordInput>): OrderedLearningRecordInput {
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

function makeKey(overrides?: Partial<OrderedLearningHistoryKey>): OrderedLearningHistoryKey {
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

		// Insert older record first
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
		// Insert newer record
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
		// Newer should come first
		expect(results[0].cellId).toBe("cell_new");
		expect(results[1].cellId).toBe("cell_old");
	});

	it("should not fail on markOrderedObservationCorrection for unknown cellId", async () => {
		const store = new MemoryOrderedLearningStore();
		await store.markOrderedObservationCorrection("nonexistent");
		// Should not throw
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
});