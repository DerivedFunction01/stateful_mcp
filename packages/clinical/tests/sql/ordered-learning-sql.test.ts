import { describe, expect, test } from "bun:test";
import { SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type {
	OrderedLearningHistoryKey,
	OrderedLearningRecordInput,
} from "../../src/store/learning/interfaces";
import { OrderedLearningRanker } from "../../src/store/learning/ordered_learning/ordered-learning-ranking";
import { SqlOrderedLearningStore } from "../../src/store/learning/ordered_learning/sql-ordered-learning-store";

function makeRecordInput(
	cellId: string,
	overrides?: Partial<OrderedLearningRecordInput["shared"]>,
): OrderedLearningRecordInput {
	return {
		shared: {
			cellId,
			soapNoteId: "note_001",
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
			patientId: "pat_001",
			patientOrganismType: "human",
			patientGender: "male",
			patientAgeBucket: "adult",
			patientSpeciesBucket: undefined,
			patientSubBucket: undefined,
			patientBucketKey: "human_male_adult",
			personnelId: "dr_smith",
			specialtyId: "ortho",
			facilityId: undefined,
			acceptedAt: new Date().toISOString(),
			...overrides,
		},
		parsedItem: {
			tag: "pain",
			targetSchema: "ObservationEvent",
			conceptId: "22253000",
			display: "Pain",
			rawText: "severe pain in left knee",
			anchorText: "pain",
			severity: "severe",
			certainty: "confirmed",
		},
		orderedTokens: [
			{ kind: "tag", key: "pain", index: 0 },
			{ kind: "concept", key: "22253000", value: "Pain", index: 1 },
			{ kind: "field", key: "severity", value: "severe", index: 2 },
		],
	};
}

describe("SqliteOrderedLearningStore", () => {
	test("should store and retrieve an ordered observation", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		const input = makeRecordInput("cell_001");

		await store.putRecord(input);

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].cellId).toBe("cell_001");
		expect(results[0].orderedTokens.length).toBe(3);
		expect(results[0].orderedTokens[0].kind).toBe("tag");
		expect(results[0].orderedTokens[0].key).toBe("pain");
	});

	test("should return empty array when no records match", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		const key: OrderedLearningHistoryKey = {
			tag: "nonexistent",
			targetSchema: "ObservationEvent",
			rawText: "nothing",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(0);
	});

	test("should filter by patientId", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		await store.putRecord(makeRecordInput("cell_001"));
		await store.putRecord(
			makeRecordInput("cell_002", { patientId: "pat_002" }),
		);

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
			patientId: "pat_001",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].cellId).toBe("cell_001");
	});

	test("should filter by personnelId", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		await store.putRecord(makeRecordInput("cell_001"));
		await store.putRecord(
			makeRecordInput("cell_002", { personnelId: "dr_jones" }),
		);

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
			personnelId: "dr_smith",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].cellId).toBe("cell_001");
	});

	test("should increment priorAcceptCount on repeated puts", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		await store.putRecord(makeRecordInput("cell_001"));
		await store.putRecord(makeRecordInput("cell_001"));

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].history?.priorAcceptCount).toBe(2);
	});

	test("should mark correction and update flags", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		await store.putRecord(makeRecordInput("cell_001"));
		await store.markCorrection("cell_001");

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].history?.priorCorrectionCount).toBe(1);
		expect(results[0].flags?.stalePreference).toBe(true);
	});

	test("should mark correction with replacement and set reviewRequired", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		await store.putRecord(makeRecordInput("cell_001"));
		await store.markCorrection("cell_001", {
			tag: "ache",
			targetSchema: "ObservationEvent",
			conceptId: "22253000",
			display: "Ache",
			rawText: "mild ache",
			anchorText: "ache",
		});

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].history?.priorCorrectionCount).toBe(1);
		expect(results[0].flags?.reviewRequired).toBe(true);
	});

	test("should not fail on markCorrection for unknown cellId", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);
		await store.markCorrection("nonexistent");
		// Should not throw
	});

	test("should derive pairwise relations on put", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		await store.putRecord(makeRecordInput("cell_001"));

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(1);
		expect(results[0].relations?.length).toBeGreaterThan(0);
	});

	test("should sort results by recencyScore descending", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		// Insert with different timestamps
		await store.putRecord(
			makeRecordInput("cell_old", {
				acceptedAt: "2024-01-01T00:00:00Z",
			}),
		);
		await store.putRecord(
			makeRecordInput("cell_new", {
				acceptedAt: "2026-07-24T00:00:00Z",
			}),
		);

		const key: OrderedLearningHistoryKey = {
			tag: "pain",
			targetSchema: "ObservationEvent",
			rawText: "severe pain in left knee",
		};
		const results = await store.getHistory(key);
		expect(results.length).toBe(2);
		expect(results[0].cellId).toBe("cell_new");
		expect(results[1].cellId).toBe("cell_old");
	});

	test("should support ranking via OrderedLearningRanker", async () => {
		const store = new SqlOrderedLearningStore(
			"sqlite",
			new SqlExecutor(await SqlBackend.connect("sqlite", ":memory:")),
		);

		// Insert history
		await store.putRecord(makeRecordInput("cell_001"));

		// Rank a candidate
		const ranker = new OrderedLearningRanker();
		const candidateTokens = [
			{ kind: "tag" as const, key: "pain", index: 0 },
			{ kind: "concept" as const, key: "22253000", value: "Pain", index: 1 },
			{ kind: "field" as const, key: "severity", value: "severe", index: 2 },
		];

		const result = await ranker.rankCandidate(
			store,
			{
				key: {
					tag: "pain",
					targetSchema: "ObservationEvent",
					rawText: "severe pain in left knee",
				},
				candidateTokens,
			},
			{ adapterId: "sqlite" },
		);

		expect(result).not.toBeNull();
		expect(result!.combinedScore).toBeGreaterThan(0);
		expect(result!.adapterId).toBe("sqlite");
	});
});
