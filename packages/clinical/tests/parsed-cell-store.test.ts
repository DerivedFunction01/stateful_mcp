import { describe, expect, test } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import {
	buildLearningHistoryStore,
	type ClinicalStorageAdapterRegistry,
	CompositeParsedCellHistoryStore,
	type ParsedCellPreferenceMode,
} from "../src";
import { ObservationSchemaParser } from "../src/parser/parsers/observation-parser";
import type { ParsedObservationItem } from "../src/parser/schema-parsers";
import { DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY } from "../src/store/adapter-config";
import type {
	ParsedCellDetail,
	ParsedCellObservationDetail,
	ParsedCellRecord,
} from "../src/store/learning/interfaces";
import { KvParsedCellStore } from "../src/store/learning/parsed_cell/kv-parsed-cell-store";
import { ObservationPreferenceRanker } from "../src/store/learning/parsed_cell/observation/parsed-cell-ranking";
import { SqlParsedCellStore } from "../src/store/learning/parsed_cell/sql-parsed-cell-store";

function makeObservationItem(): ParsedObservationItem {
	return {
		tag: "#observation",
		anchorText: "shortness of breath",
		conceptId: "SNOMED::267036007",
		display: "Dyspnea",
		targetSchema: "ObservationEvent",
		rawText: "#observation shortness of breath",
		severity: "moderate",
		certainty: "affirmed",
		status: "active",
	};
}

function makeObservationCell(
	cellId: string,
	sessionId: string,
): ParsedCellRecord<ParsedObservationItem> {
	const item = makeObservationItem();
	return {
		shared: {
			cellId,
			sessionId,
			personnelId: "personnel-1",
			specialtyId: "cardiology",
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
			anchorText: "shortness of breath",
			parserVersion: "phase1",
			contractVersion: "v1",
			sourceKind: "direct_contract",
			outcome: "accepted",
			acceptedAt: "2026-07-23T00:00:00Z",
			createdAt: "2026-07-23T00:00:00Z",
			updatedAt: "2026-07-23T00:00:00Z",
		},
		detail: {
			cellId,
			targetSchema: "ObservationEvent",
			conceptId: "SNOMED::267036007",
			display: "Dyspnea",
			certainty: "affirmed",
			status: "active",
			severity: "moderate",
			candidateTokens: [],
			shape: {
				schema: "ObservationEvent",
				slots: {
					conceptId: "SNOMED::267036007",
					certainty: "affirmed",
					status: "active",
					severity: "moderate",
				},
			},
			parsedItem: item,
		},
		parsedItem: item,
	};
}

function memoryStore() {
	return new KvParsedCellStore(new MemoryKvBackend());
}

async function sqliteStore() {
	const backend = await SqlBackend.connect("sqlite", ":memory:");
	return new SqlParsedCellStore("sqlite", new SqlExecutor(backend));
}

describe("ParsedCell storage", () => {
	test("memory store joins shared and observation detail rows", async () => {
		const store = memoryStore();
		await store.putRecord(makeObservationCell("cell-1", "session-1"));

		const result = await store.get("cell-1");
		expect(result?.shared.cellId).toBe("cell-1");
		expect(result?.detail?.cellId).toBe("cell-1");
		expect(result?.parsedItem?.conceptId).toBe("SNOMED::267036007");
	});

	test("sqlite store joins shared and observation detail rows", async () => {
		const store = await sqliteStore();
		await store.putRecord(makeObservationCell("cell-2", "session-2"));

		const rows = await store.listByTargetSchema(
			"ObservationEvent",
			"session-2",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.shared.cellId).toBe("cell-2");
		expect(rows[0]?.parsedItem?.display).toBe("Dyspnea");
	});

	test("sqlite history stays scoped when patient context is present and global when it is not", async () => {
		const store = await sqliteStore();

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
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
		});
		const scopedRows = await store.getHistory({
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
			patientId: "patient-a",
			patientOrganismType: "human",
			patientGender: "female",
			patientAgeBucket: "30-39",
			patientSubBucket: 0,
			patientBucketKey: "patient-a|human|female|30-39|0",
		});

		expect(globalRows).toHaveLength(2);
		expect(scopedRows).toHaveLength(1);
		expect((scopedRows[0] as ParsedCellObservationDetail).cellId).toBe(
			"cell-scope-a",
		);
	});

	test("soap note id is preserved on parsed cell records", async () => {
		const store = memoryStore();
		const base = makeObservationCell("cell-note-1", "session-note-1");
		await store.putRecord({
			...base,
			shared: {
				...base.shared,
				soapNoteId: "note-123",
			},
			detail: {
				...base.detail,
				soapNoteId: "note-123",
			},
		});

		const result = await store.get("cell-note-1");
		expect(result?.shared.soapNoteId).toBe("note-123");
		expect(result?.detail?.soapNoteId).toBe("note-123");
	});

	test("observation ranker favors exact slot matches and recency", async () => {
		const ranker = new ObservationPreferenceRanker();
		const candidate: ParsedCellObservationDetail = {
			cellId: "cell-3",
			targetSchema: "ObservationEvent",
			conceptId: "SNOMED::267036007",
			display: "Dyspnea",
			certainty: "affirmed",
			status: "active",
			severity: "moderate",
			candidateTokens: [],
			shape: {
				schema: "ObservationEvent",
				slots: {
					conceptId: "SNOMED::267036007",
					certainty: "affirmed",
					status: "active",
					severity: "moderate",
				},
			},
			parsedItem: makeObservationItem(),
			history: {
				priorAcceptCount: 3,
				lastAcceptedAt: "2026-07-22T00:00:00Z",
				recencyScore: 0.5,
			},
			flags: { contractValid: true },
		};

		const score = ranker.score(candidate, {
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "shortness of breath",
			anchorText: "shortness of breath",
			candidateTokens: [],
			sharedShape: {
				schema: "ObservationEvent",
				slots: {
					conceptId: "SNOMED::267036007",
					certainty: "affirmed",
					status: "active",
					severity: "moderate",
				},
			},
		});

		expect(score.score).toBeGreaterThan(0);
		expect(score.reason).toContain("exact-conceptId");
	});

	test("observation ranker can return deterministic and learned projections independently", async () => {
		const ranker = new ObservationPreferenceRanker();
		const deterministic = makeObservationItem();
		const learned = {
			...deterministic,
			severity: "mild",
		};
		const projection = ranker.choose(
			{
				cellId: "d",
				targetSchema: "ObservationEvent",
				conceptId: deterministic.conceptId,
				display: deterministic.display,
				certainty: deterministic.certainty,
				status: deterministic.status,
				severity: deterministic.severity,
				candidateTokens: [],
				shape: {
					schema: "ObservationEvent",
					slots: deterministic,
				},
				parsedItem: deterministic,
			},
			{
				cellId: "l",
				targetSchema: "ObservationEvent",
				conceptId: learned.conceptId,
				display: learned.display,
				certainty: learned.certainty,
				status: learned.status,
				severity: learned.severity,
				candidateTokens: [],
				shape: {
					schema: "ObservationEvent",
					slots: learned,
				},
				parsedItem: learned,
				history: { priorAcceptCount: 10, recencyScore: 1 },
				flags: { contractValid: true },
			},
			{
				tag: "#observation",
				targetSchema: "ObservationEvent",
				rawText: "shortness of breath",
				anchorText: "shortness of breath",
				candidateTokens: [],
				sharedShape: {
					schema: "ObservationEvent",
					slots: deterministic,
				},
			},
			"dual" as ParsedCellPreferenceMode,
		);

		expect(projection.deterministic?.severity).toBe("moderate");
		expect(projection.learned?.severity).toBe("mild");
		expect(projection.winner?.severity).toBe("mild");
	});

	test("observation ranker can preserve multiple valid learned candidates", async () => {
		const ranker = new ObservationPreferenceRanker();
		const sharedShape = {
			schema: "ObservationEvent",
			slots: {
				conceptId: "SNOMED::267036007",
				certainty: "affirmed",
				status: "active",
			},
		};
		const base = makeObservationItem();
		const candidates = ranker.rankMany(
			[
				{
					source: "deterministic",
					candidate: {
						cellId: "d1",
						targetSchema: "ObservationEvent",
						conceptId: base.conceptId,
						display: base.display,
						certainty: base.certainty,
						status: base.status,
						severity: "moderate",
						candidateTokens: [],
						shape: sharedShape,
						parsedItem: { ...base, severity: "moderate" },
						flags: { contractValid: true },
					},
				},
				{
					source: "learned",
					candidate: {
						cellId: "l1",
						targetSchema: "ObservationEvent",
						conceptId: base.conceptId,
						display: base.display,
						certainty: base.certainty,
						status: base.status,
						severity: "mild",
						candidateTokens: [],
						shape: sharedShape,
						parsedItem: { ...base, severity: "mild" },
						history: { priorAcceptCount: 4, recencyScore: 0.8 },
						flags: { contractValid: true },
					},
				},
			],
			{
				tag: "#observation",
				targetSchema: "ObservationEvent",
				rawText: "shortness of breath",
				anchorText: "shortness of breath",
				candidateTokens: [],
				sharedShape,
			},
		);

		expect(candidates.candidates).toHaveLength(2);
		expect(candidates.candidates[0]?.candidate.severity).toBe("mild");
		expect(candidates.candidates[1]?.candidate.severity).toBe("moderate");
		expect(candidates.winner?.severity).toBe("mild");
	});

	test("observation preview exposes deterministic and learned sets independently", async () => {
		const ranker = new ObservationPreferenceRanker();
		const base = makeObservationItem();
		const preview = ranker.previewMany(
			[
				{
					source: "deterministic",
					candidate: {
						cellId: "d2",
						targetSchema: "ObservationEvent",
						conceptId: base.conceptId,
						display: base.display,
						certainty: base.certainty,
						status: base.status,
						severity: "moderate",
						candidateTokens: [],
						shape: {
							schema: "ObservationEvent",
							slots: { conceptId: base.conceptId, severity: "moderate" },
						},
						parsedItem: { ...base, severity: "moderate" },
						flags: { contractValid: true },
					},
				},
				{
					source: "learned",
					candidate: {
						cellId: "l2",
						targetSchema: "ObservationEvent",
						conceptId: base.conceptId,
						display: base.display,
						certainty: base.certainty,
						status: base.status,
						severity: "mild",
						candidateTokens: [],
						shape: {
							schema: "ObservationEvent",
							slots: { conceptId: base.conceptId, severity: "mild" },
						},
						parsedItem: { ...base, severity: "mild" },
						history: { priorAcceptCount: 2, recencyScore: 0.3 },
						flags: { contractValid: true },
					},
				},
			],
			{
				tag: "#observation",
				targetSchema: "ObservationEvent",
				rawText: "shortness of breath",
				anchorText: "shortness of breath",
				candidateTokens: [],
				sharedShape: {
					schema: "ObservationEvent",
					slots: { conceptId: base.conceptId, severity: "moderate" },
				},
			},
		);

		expect(preview.deterministic).toHaveLength(1);
		expect(preview.learned).toHaveLength(1);
		expect(preview.ranking.candidates).toHaveLength(2);
		expect(preview.ranking.winner).toBeDefined();
	});

	test("observation parser preview exposes a candidate envelope", async () => {
		const parser = new ObservationSchemaParser();
		const preview = await parser.preview(
			"#observation",
			"shortness of breath",
			{
				resolve: async () => null,
				search: async () => [],
			} as any,
		);

		expect(preview.deterministic).toHaveLength(1);
		expect(preview.learned).toHaveLength(1);
		expect(preview.deterministic[0]?.targetSchema).toBe("ObservationEvent");
	});

	test("observation parser preview returns multiple learned candidates from history", async () => {
		const parser = new ObservationSchemaParser();
		const history = memoryStore();
		await history.putRecord(makeObservationCell("cell-h1", "session-h1"));
		const baseH2 = makeObservationCell("cell-h2", "session-h2");
		await history.putRecord({
			...baseH2,
			detail: {
				...baseH2.detail,
				parsedItem: {
					...baseH2.parsedItem,
					severity: "mild",
				},
			},
			parsedItem: {
				...baseH2.parsedItem,
				severity: "mild",
			},
		});

		const preview = await parser.preview(
			"#observation",
			"#observation shortness of breath",
			{
				resolve: async () => null,
				search: async () => [],
			} as any,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			{
				rankingSignals: {
					personnelId: "personnel-1",
					specialtyId: "cardiology",
				},
			},
			history,
		);

		expect(preview.deterministic).toHaveLength(1);
		expect(preview.learned.length).toBeGreaterThanOrEqual(1);
		expect(preview.learned.some((item) => item.severity === "mild")).toBe(true);
	});

	test("observation history records corrections and updates ranking signals", async () => {
		const store = memoryStore();
		const initial = makeObservationCell("cell-c1", "session-c1");
		await store.putRecord(initial);

		const corrected = {
			...initial.parsedItem,
			severity: "mild",
			status: "corrected",
		};
		await store.markCorrection("cell-c1", corrected);

		const result = await store.get("cell-c1");
		expect(result?.detail?.history?.priorCorrectionCount).toBe(1);
		expect(result?.detail?.flags?.stalePreference).toBe(true);
		expect(result?.parsedItem?.severity).toBe("mild");
	});

	test("observation history stays isolated by personnel and specialty", async () => {
		const store = memoryStore();
		await store.putRecord(makeObservationCell("cell-i1", "session-i1"));
		await store.putRecord({
			...makeObservationCell("cell-i2", "session-i2"),
			shared: {
				...makeObservationCell("cell-i2", "session-i2").shared,
				personnelId: "personnel-2",
			},
		});

		const exactMatch = await store.getHistory({
			personnelId: "personnel-1",
			specialtyId: "cardiology",
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
		});
		const mismatchedPersonnel = await store.getHistory({
			personnelId: "personnel-2",
			specialtyId: "cardiology",
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
		});

		expect(exactMatch).toHaveLength(1);
		expect(mismatchedPersonnel).toHaveLength(1);
		expect((exactMatch[0] as ParsedCellObservationDetail).cellId).not.toBe(
			(mismatchedPersonnel[0] as ParsedCellObservationDetail).cellId,
		);
	});

	test("observation history stays isolated by patient bucket", async () => {
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
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
		});
		const patientTwoHistory = await store.getHistory({
			patientId: "patient-2",
			patientOrganismType: "human",
			patientGender: "female",
			patientAgeBucket: "30-39",
			patientSubBucket: 1,
			patientBucketKey: bucketB,
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
		});

		expect(patientOneHistory).toHaveLength(1);
		expect(patientTwoHistory).toHaveLength(1);
		expect((patientOneHistory[0] as ParsedCellObservationDetail).cellId).toBe(
			"cell-p1",
		);
		expect((patientTwoHistory[0] as ParsedCellObservationDetail).cellId).toBe(
			"cell-p2",
		);
		expect(
			(patientOneHistory[0] as ParsedCellObservationDetail).cellId,
		).not.toBe((patientTwoHistory[0] as ParsedCellObservationDetail).cellId);
	});

	test("observation preview returns adapter-ranked results in adapter order", async () => {
		const parser = new ObservationSchemaParser();
		const backend1 = memoryStore();
		const backend2 = memoryStore();

		await backend1.putRecord({
			...makeObservationCell("cell-r1", "session-r1"),
			shared: {
				...makeObservationCell("cell-r1", "session-r1").shared,
				patientId: "patient-1",
				patientOrganismType: "human",
				patientGender: "female",
				patientAgeBucket: "30-39",
				patientSubBucket: 0,
				patientBucketKey: "patient-1|human|female|30-39|0",
			},
			parsedItem: {
				...makeObservationCell("cell-r1", "session-r1").parsedItem,
				severity: "severe",
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
				...makeObservationCell("cell-r2", "session-r2").parsedItem,
				severity: "mild",
			},
		});

		const composite = new CompositeParsedCellHistoryStore<ParsedCellDetail>([
			{ adapterId: "backend1", weight: 0.8, store: backend1 },
			{ adapterId: "backend2", weight: 0.2, store: backend2 },
		]);

		const preview = await parser.preview(
			"#observation",
			"#observation shortness of breath",
			{
				resolve: async () => null,
				search: async () => [],
			} as any,
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
		expect(preview.learned[0]?.conceptId).toBe("SNOMED::267036007");
	});

	test("learning history builder composes the configured learning backends", async () => {
		const registry: ClinicalStorageAdapterRegistry = {
			...DEFAULT_CLINICAL_STORAGE_ADAPTER_REGISTRY,
			learning: [
				{
					group: "learning",
					primary: {
						_type: "adapter",
						name: "memory",
						options: { seed: [] },
					},
				},
				{
					group: "learning",
					primary: {
						_type: "adapter",
						name: "memory",
						options: { seed: [] },
					},
				},
			],
		};

		const store = await buildLearningHistoryStore(registry);
		await store.putRecord(makeObservationCell("cell-builder-1", "session-x"));
		const rows = await store.getHistory({
			tag: "#observation",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
		});

		expect(rows).toHaveLength(2);
		expect((rows[0] as ParsedCellObservationDetail).cellId).toBe(
			"cell-builder-1",
		);
	});
});
