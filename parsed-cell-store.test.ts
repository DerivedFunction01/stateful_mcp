/**
 * parsed-cell-store.test.ts (v2)
 *
 * Replaces the deleted v1 test. Covers:
 *  - KV store put/get round-trip using v2 ParsedCellRecord (parsedItem + learningMetadata)
 *  - SQLite store put/list round-trip
 *  - Patient-scoped history isolation
 *  - CompositeParsedCellHistoryStore fan-out
 *  - ObservationSchemaParser.preview() returning learned candidates from history
 *
 * All field access uses v2 patterns:
 *  - parsedItem.concept[0] (not .conceptId / .display)
 *  - parsedItem.extractedData.* (not .severity / .certainty / .status directly)
 *  - parsedItem.extractedData.measurement.* (not .value / .unit)
 *  - No detail property; learningMetadata is the metadata carrier
 */
import { describe, expect, test } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { ParsedObservationItem } from "../src/parser/schema-parsers";
import { CANONICAL_TAGS } from "../src/parser/schema-parsers";
import "../src/store/learning/parsed_cell/transforms/observation-transform";
import "../src/store/learning/parsed_cell/transforms/vitals-transform";
import "../src/store/learning/parsed_cell/transforms/medication-transform";
import "../src/store/learning/parsed_cell/transforms/clinical-date-range-transform";
import {
	createObservationFieldRegistry,
	observationConfig,
	observationRouter,
} from "../src/parser/field-registry/observation";
import { GenericSchemaParser } from "../src/parser/generic-schema-parser";
import type { ParsedCellRecord } from "../src/store/learning/interfaces";
import { CompositeParsedCellHistoryStore } from "../src/store/learning/parsed_cell/history-store";
import { KvParsedCellStore } from "../src/store/learning/parsed_cell/kv-parsed-cell-store";
import { SqlParsedCellStore } from "../src/store/learning/parsed_cell/sql-parsed-cell-store";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeObservationItem(): ParsedObservationItem {
	return {
		targetSchema: CANONICAL_TAGS.OBSERVATION,
		attributes: {},
		concept: [{ conceptId: "SNOMED::267036007", display: "Dyspnea" }],
		rawText: "#observation shortness of breath",
		tag: CANONICAL_TAGS.OBSERVATION,
		extractedData: {
			severity: "moderate",
			certainty: "affirmed",
			status: "active",
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
			rawText: "#observation shortness of breath",
			anchorText: "shortness of breath",
			parserVersion: "phase2",
			contractVersion: "v1",
			sourceKind: "direct_contract",
			outcome: "accepted",
			acceptedAt: "2026-07-23T00:00:00Z",
			createdAt: "2026-07-23T00:00:00Z",
			updatedAt: "2026-07-23T00:00:00Z",
		},
		parsedItem: item,
		learningMetadata: {
			history: {
				priorAcceptCount: 1,
				priorCorrectionCount: 0,
				lastAcceptedAt: "2026-07-23T00:00:00Z",
			},
			flags: {
				contractValid: true,
				stalePreference: false,
				reviewRequired: false,
			},
			candidateTokens: [],
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ParsedCell v2 store (replacement)", () => {
	test("memory store persists and retrieves v2 parsedItem", async () => {
		const store = memoryStore();
		await store.putRecord(makeObservationCell("cell-1", "session-1"));

		const result = await store.get("cell-1");
		expect(result?.shared.cellId).toBe("cell-1");
		// v2: no .detail — parsedItem is directly on the record
		expect(result?.parsedItem?.targetSchema).toBe("ObservationEvent");
		// v2: concept is CodeableConcept[]
		expect(result?.parsedItem?.concept[0]?.conceptId).toBe("SNOMED::267036007");
		// v2: fields in extractedData
		expect(result?.parsedItem?.extractedData?.certainty).toBe("affirmed");
		expect(result?.parsedItem?.extractedData?.severity).toBe("moderate");
	});

	test("sqlite store persists and retrieves v2 parsedItem", async () => {
		const store = await sqliteStore();
		await store.putRecord(makeObservationCell("cell-2", "session-2"));

		const rows = await store.listByTargetSchema(
			"ObservationEvent",
			"session-2",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.shared.cellId).toBe("cell-2");
		// v2: no .detail.conceptId — use parsedItem.concept[0].conceptId
		expect(rows[0]?.parsedItem?.concept[0]?.conceptId).toBe(
			"SNOMED::267036007",
		);
	});

	test("memory store history is isolated by patient bucket", async () => {
		const store = memoryStore();
		const bucketA = "patient-1|human|female|30-39|0";
		const bucketB = "patient-2|human|female|30-39|1";

		await store.putRecord({
			...makeObservationCell("cell-p1", "session-p1"),
			shared: {
				...makeObservationCell("cell-p1", "session-p1").shared,
				patientId: "patient-1",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: bucketA,
			},
		});
		await store.putRecord({
			...makeObservationCell("cell-p2", "session-p2"),
			shared: {
				...makeObservationCell("cell-p2", "session-p2").shared,
				patientId: "patient-2",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 1,
				patientBucketKey: bucketB,
			},
		});

		const patientOneHistory = await store.getHistory({
			patientId: "patient-1",
			patientOrganismType: "human",
			patientGender: "female",
			patientAgeBucket: "30-39",
			patientSubBucket: 0,
			patientBucketKey: bucketA,
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "#observation shortness of breath",
		});
		const patientTwoHistory = await store.getHistory({
			patientId: "patient-2",
			patientOrganismType: "human",
			patientGender: "female",
			patientAgeBucket: "30-39",
			patientSubBucket: 1,
			patientBucketKey: bucketB,
			tag: CANONICAL_TAGS.OBSERVATION,
			targetSchema: CANONICAL_TAGS.OBSERVATION,
			rawText: "#observation shortness of breath",
		});

		expect(patientOneHistory).toHaveLength(1);
		expect(patientTwoHistory).toHaveLength(1);
		// v2: cellId is on shared, not on a detail object
		expect(patientOneHistory[0]?.shared.cellId).toBe("cell-p1");
		expect(patientTwoHistory[0]?.shared.cellId).toBe("cell-p2");
		expect(patientOneHistory[0]?.shared.cellId).not.toBe(
			patientTwoHistory[0]?.shared.cellId,
		);
	});

	test("observation preview returns learned candidates from history (v2)", async () => {
		const parser = new GenericSchemaParser("ObservationEvent", {
			targetSchema: "ObservationEvent",
			createRegistry: createObservationFieldRegistry,
			router: observationRouter,
			preparsedContextKeys: observationConfig.preparsedContextKeys,
		});
		const backend1 = memoryStore();
		const backend2 = memoryStore();

		const cellBase = makeObservationCell("cell-r1", "session-r1");

		await backend1.putRecord({
			...cellBase,
			shared: {
				...cellBase.shared,
				cellId: "cell-r1",
				patientId: "patient-1",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-1|human|female|30-39|0",
			},
			parsedItem: {
				...makeObservationItem(),
				extractedData: {
					...makeObservationItem().extractedData,
					severity: "severe",
				},
			},
		});

		await backend2.putRecord({
			...makeObservationCell("cell-r2", "session-r2"),
			shared: {
				...makeObservationCell("cell-r2", "session-r2").shared,
				patientId: "patient-1",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-1|human|female|30-39|0",
			},
			parsedItem: {
				...makeObservationItem(),
				extractedData: {
					...makeObservationItem().extractedData,
					severity: "mild",
				},
			},
		});

		const composite = new CompositeParsedCellHistoryStore([
			{ adapterId: "backend1", weight: 0.8, store: backend1 },
			{ adapterId: "backend2", weight: 0.2, store: backend2 },
		]);

		const preview = await parser.preview(
			CANONICAL_TAGS.OBSERVATION,
			"#observation shortness of breath",
			{ resolve: async () => null, search: async () => [] } as any,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			{
				patientContext: {
					patientId: "patient-1",
					organismType: "human",
					gender: "female",
					ageBucket: "30-39",
					subBucket: 0,
					bucketKey: "patient-1|human|female|30-39|0",
				},
			},
			composite,
		);

		expect(preview.learned.length).toBeGreaterThanOrEqual(1);
		// v2: concept is CodeableConcept[]
		expect(
			(preview.learned[0] as ParsedObservationItem)?.concept[0]?.conceptId,
		).toBe("SNOMED::267036007");
	});
});
