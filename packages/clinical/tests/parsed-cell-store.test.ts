import Database from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	MemoryParsedCellStore,
	ObservationPreferenceRanker,
	type ParsedCellPreferenceMode,
	type ParsedCellV1,
	SqliteParsedCellStore,
} from "../src";
import type { ParsedObservationItem } from "../src/parser/schema-parsers";

function makeObservationCell(
	cellId: string,
	sessionId: string,
): ParsedCellV1<ParsedObservationItem> {
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
		parsedItem: {
			tag: "#observation",
			anchorText: "shortness of breath",
			conceptId: "SNOMED::267036007",
			display: "Dyspnea",
			targetSchema: "ObservationEvent",
			rawText: "#observation shortness of breath",
			severity: "moderate",
			certainty: "affirmed",
			status: "active",
		},
	};
}

describe("ParsedCellV1 storage", () => {
	test("memory store joins shared and observation detail rows", async () => {
		const store = new MemoryParsedCellStore();
		await store.putObservation(makeObservationCell("cell-1", "session-1"));

		const result = await store.get("cell-1");
		expect(result?.shared.cellId).toBe("cell-1");
		expect(result?.detail?.cellId).toBe("cell-1");
		expect(result?.parsedItem?.conceptId).toBe("SNOMED::267036007");
	});

	test("sqlite store joins shared and observation detail rows", async () => {
		const db = new Database(":memory:");
		const store = new SqliteParsedCellStore(db);
		await store.putObservation(makeObservationCell("cell-2", "session-2"));

		const pilotRows = await store.listObservationPilots("session-2");
		expect(pilotRows).toHaveLength(1);
		expect(pilotRows[0]?.shared.cellId).toBe("cell-2");
		expect(pilotRows[0]?.parsedItem?.display).toBe("Dyspnea");
	});

	test("observation ranker favors exact slot matches and recency", async () => {
		const ranker = new ObservationPreferenceRanker();
		const candidate = {
			cellId: "cell-3",
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
			parsedItem: makeObservationCell("cell-3", "session-3").parsedItem,
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
		const deterministic = makeObservationCell("cell-4", "session-4")
			.parsedItem as any;
		const learned = {
			...deterministic,
			severity: "mild",
		};
		const projection = ranker.choose(
			{
				cellId: "d",
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
		const base = makeObservationCell("cell-5", "session-5").parsedItem;
		const candidates = ranker.rankMany(
			[
				{
					source: "deterministic",
					candidate: {
						cellId: "d1",
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
		const base = makeObservationCell("cell-6", "session-6").parsedItem;
		const preview = ranker.previewMany(
			[
				{
					source: "deterministic",
					candidate: {
						cellId: "d2",
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
		expect(preview.ranking.winner?.severity).toBe("mild");
	});
});
