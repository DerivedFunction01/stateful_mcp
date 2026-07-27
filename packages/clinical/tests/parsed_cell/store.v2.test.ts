import { describe, expect, test } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { ParsedObservationItem } from "../../src/parser/schema-parsers";
import { CANONICAL_TAGS } from "../../src/parser/schema-parsers";
import type { ParsedCellRecord } from "../../src/store/learning/interfaces";
import { CompositeParsedCellHistoryStore } from "../../src/store/learning/parsed_cell/history-store";
import { KvParsedCellStore } from "../../src/store/learning/parsed_cell/kv-parsed-cell-store";
import { SqlParsedCellStore } from "../../src/store/learning/parsed_cell/sql-parsed-cell-store";

import "../../src/store/learning/parsed_cell/transforms/observation-transform";
import "../../src/store/learning/parsed_cell/transforms/vitals-transform";
import "../../src/store/learning/parsed_cell/transforms/medication-transform";
import "../../src/store/learning/parsed_cell/transforms/clinical-date-range-transform";

function makeObservationItem(): ParsedObservationItem {
	return {
		targetSchema: CANONICAL_TAGS.OBSERVATION,
		attributes: {},
		concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		rawText: "temperature 101F",
		tag: CANONICAL_TAGS.OBSERVATION,
		extractedData: {
			certainty: "confirmed",
			status: "present",
			severity: { score: 3, maxScore: 5, normalizedScore: 0.6 },
			trajectory: "worsening",
		},
	};
}

function makeObservationCell(
	cellId: string,
	sessionId: string,
): ParsedCellRecord {
	const item = makeObservationItem();
	return {
		shared: {
			cellId,
			sessionId,
			personnelId: "personnel-1",
			specialtyId: "cardiology",
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "temperature 101F",
			anchorText: "101F",
			parserVersion: "phase1",
			contractVersion: "v1",
			sourceKind: "direct_contract",
			outcome: "accepted",
			acceptedAt: "2026-07-23T00:00:00Z",
			createdAt: "2026-07-23T00:00:00Z",
			updatedAt: "2026-07-23T00:00:00Z",
		},
		parsedItem: item,
		learningMetadata: {
			history: {},
			flags: {},
		},
	};
}

function memoryStore() {
	return new KvParsedCellStore(new MemoryKvBackend());
}

async function sqliteStore() {
	const backend = await SqlBackend.connect("sqlite", ":memory:");
	return new SqlParsedCellStore("sqlite", new SqlExecutor(backend));
}

describe("ParsedCell v2 storage", () => {
	test("memory store persists and retrieves parsedItem", async () => {
		const store = memoryStore();
		await store.putRecord(makeObservationCell("cell-1", "session-1"));

		const result = await store.get("cell-1");
		expect(result?.shared.cellId).toBe("cell-1");
		expect(result?.parsedItem?.targetSchema).toBe("ObservationEvent");
		expect(result?.parsedItem?.extractedData?.certainty).toBe("confirmed");
	});

	test("sqlite store persists and retrieves parsedItem", async () => {
		const store = await sqliteStore();
		await store.putRecord(makeObservationCell("cell-2", "session-2"));

		const rows = await store.listByTargetSchema(
			"ObservationEvent",
			"session-2",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.shared.cellId).toBe("cell-2");
		expect(rows[0]?.parsedItem?.extractedData?.trajectory).toBe("worsening");
	});

	test("memory store history is scoped by patient fields", async () => {
		const store = memoryStore();
		await store.putRecord({
			...makeObservationCell("cell-scope-a", "session-scope-a"),
			shared: {
				...makeObservationCell("cell-scope-a", "session-scope-a").shared,
				patientId: "patient-a",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-a|human|female|30-39|0",
			},
		});
		await store.putRecord({
			...makeObservationCell("cell-scope-b", "session-scope-b"),
			shared: {
				...makeObservationCell("cell-scope-b", "session-scope-b").shared,
				patientId: "patient-b",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-b|human|female|30-39|0",
			},
		});

		const globalRows = await store.getHistory({
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "temperature 101F",
		});
		const scopedRows = await store.getHistory({
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "temperature 101F",
			patientId: "patient-a",
			patientOrganismType: "human",
			patientGender: "female",
			patientAgeBucket: "30-39",
			patientSubBucket: 0,
			patientBucketKey: "patient-a|human|female|30-39|0",
		});

		expect(globalRows).toHaveLength(2);
		expect(scopedRows).toHaveLength(1);
		expect(scopedRows[0]?.shared.cellId).toBe("cell-scope-a");
	});

	test("sqlite store history is scoped by patient fields", async () => {
		const store = await sqliteStore();
		await store.putRecord({
			...makeObservationCell("cell-sql-a", "session-sql-a"),
			shared: {
				...makeObservationCell("cell-sql-a", "session-sql-a").shared,
				patientId: "patient-a",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-a|human|female|30-39|0",
			},
		});
		await store.putRecord({
			...makeObservationCell("cell-sql-b", "session-sql-b"),
			shared: {
				...makeObservationCell("cell-sql-b", "session-sql-b").shared,
				patientId: "patient-b",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-b|human|female|30-39|0",
			},
		});

		const scopedRows = await store.getHistory({
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "temperature 101F",
			patientId: "patient-a",
			patientOrganismType: "human",
			patientGender: "female",
			patientAgeBucket: "30-39",
			patientSubBucket: 0,
			patientBucketKey: "patient-a|human|female|30-39|0",
		});

		expect(scopedRows).toHaveLength(1);
		expect(scopedRows[0]?.shared.cellId).toBe("cell-sql-a");
	});

	test("markCorrection updates learningMetadata and parsedItem", async () => {
		const store = memoryStore();
		const initial = makeObservationCell("cell-c1", "session-c1");
		await store.putRecord(initial);

		const correctedItem = {
			...makeObservationItem(),
			extractedData: {
				...makeObservationItem().extractedData,
				severity: { score: 1, maxScore: 5, normalizedScore: 0.2 },
			},
		};
		await store.markCorrection("cell-c1", correctedItem);

		const result = await store.get("cell-c1");
		expect(result?.learningMetadata.history?.priorCorrectionCount).toBe(1);
		expect(result?.learningMetadata.flags?.stalePreference).toBe(true);
		expect(result?.learningMetadata.flags?.reviewRequired).toBe(true);
		expect(result?.parsedItem?.extractedData?.severity?.score).toBe(1);
	});

	test("composite store fans out putRecord and getHistory", async () => {
		const backend1 = memoryStore();
		const backend2 = memoryStore();

		const composite = new CompositeParsedCellHistoryStore([
			{ adapterId: "a1", weight: 0.6, store: backend1 },
			{ adapterId: "a2", weight: 0.4, store: backend2 },
		]);

		await composite.putRecord(makeObservationCell("cell-comp", "session-comp"));

		const history = await composite.getHistory({
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "temperature 101F",
		});

		expect(history).toHaveLength(2);
		expect(history[0]?.shared.cellId).toBe("cell-comp");
		expect(history[1]?.shared.cellId).toBe("cell-comp");
	});

	test("v2 sql store listByTargetSchema filters correctly", async () => {
		const store = await sqliteStore();
		await store.putRecord(makeObservationCell("cell-list-1", "session-list-1"));
		await store.putRecord({
			...makeObservationCell("cell-list-2", "session-list-2"),
			shared: {
				...makeObservationCell("cell-list-2", "session-list-2").shared,
				targetSchema: CANONICAL_TAGS.VITALS,
			},
			parsedItem: {
				...makeObservationCell("cell-list-2", "session-list-2").parsedItem,
				targetSchema: CANONICAL_TAGS.VITALS,
			},
		});

		const observationRows = await store.listByTargetSchema("ObservationEvent");
		const vitalsRows = await store.listByTargetSchema("VitalsMeasurementEvent");

		expect(observationRows).toHaveLength(1);
		expect(observationRows[0]?.shared.cellId).toBe("cell-list-1");
		expect(vitalsRows).toHaveLength(1);
		expect(vitalsRows[0]?.shared.cellId).toBe("cell-list-2");
	});

	test("v2 memory store markCorrection sets reviewRequired false when no replacement", async () => {
		const store = memoryStore();
		await store.putRecord(makeObservationCell("cell-no-replace", "session-nr"));
		await store.markCorrection("cell-no-replace");

		const result = await store.get("cell-no-replace");
		expect(result?.learningMetadata.flags?.reviewRequired).toBe(false);
		expect(result?.learningMetadata.flags?.stalePreference).toBe(true);
	});

	test("memory store rankHistoryBySchema scores and sorts by relevance", async () => {
		const store = memoryStore();

		const matchingItem: ParsedObservationItem = {
			...makeObservationItem(),
			extractedData: {
				certainty: "confirmed",
				status: "present",
				severity: { score: 3, maxScore: 5, normalizedScore: 0.6 },
				trajectory: "worsening",
			},
		};

		const nonMatchingItem: ParsedObservationItem = {
			...makeObservationItem(),
			extractedData: {
				certainty: "ruled_out",
				status: "absent",
				severity: { score: 5, maxScore: 5, normalizedScore: 1 },
				trajectory: "stable",
			},
		};

		await store.putRecord(
			makeObservationCell("cell-match", "session-rank"),
		);
		await store.putRecord({
			...makeObservationCell("cell-mismatch", "session-rank"),
			parsedItem: nonMatchingItem,
		});

		const ranked = await store.rankHistoryBySchema(
			CANONICAL_TAGS.OBSERVATION,
			{
				tag: CANONICAL_TAGS.OBSERVATION,
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				rawText: "temperature 101F",
			},
			matchingItem,
		);

		expect(ranked).toHaveLength(2);
		expect(ranked[0]?.shared.cellId).toBe("cell-match");
		expect(ranked[0]?.rankScore).toBeGreaterThan(0);
		expect(typeof ranked[0]?.rankReason).toBe("string");
		expect(ranked[1]?.shared.cellId).toBe("cell-mismatch");
		expect(ranked[1]!.rankScore).toBeLessThanOrEqual(ranked[0]!.rankScore);
	});
});
