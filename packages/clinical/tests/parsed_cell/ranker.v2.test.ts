import { describe, expect, it } from "bun:test";
import type {
	ParsedObservationItem,
	ParsedVitalsItem,
} from "../../src/parser/schema-parsers";
import { CANONICAL_TAGS } from "../../src/parser/schema-parsers";
import type { ParsedCellRecord } from "../../src/store/learning/interfaces";
import { GenericPreferenceRanker } from "../../src/store/learning/parsed_cell/ranker";

import "../../src/store/learning/parsed_cell/transforms/observation-transform";
import "../../src/store/learning/parsed_cell/transforms/vitals-transform";
import "../../src/store/learning/parsed_cell/transforms/medication-transform";
import "../../src/store/learning/parsed_cell/transforms/clinical-date-range-transform";

function buildShared(
	overrides: Record<string, unknown> = {},
): ParsedCellRecord["shared"] {
	return {
		cellId: "cell-1",
		tag: CANONICAL_TAGS.OBSERVATION,
		targetSchema: CANONICAL_TAGS.OBSERVATION,
		rawText: "temperature 101F",
		anchorText: "101F",
		parserVersion: "1.0",
		contractVersion: "1.0",
		sourceKind: "direct_contract",
		outcome: "accepted",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function buildObservationRecord(
	overrides: Partial<ParsedCellRecord> = {},
): ParsedCellRecord {
	const item: ParsedObservationItem = {
		targetSchema: CANONICAL_TAGS.OBSERVATION,
		attributes: {},
		concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		rawText: "temperature 101F",
		tag: CANONICAL_TAGS.OBSERVATION,
		extractedData: {
			certainty: "confirmed",
			status: "present",
			severity: {
				score: 3,
				maxScore: 5,
				normalizedScore: 0.6,
			},
			duration: {
				magnitude: 2,
				unit: "day",
				operator: "eq",
				is_approximate: false,
			},
			trajectory: "worsening",
		},
	};

	return {
		shared: buildShared(),
		parsedItem: item,
		learningMetadata: {
			history: {},
			flags: {},
		},
		...overrides,
	} as ParsedCellRecord;
}

function buildVitalsRecord(
	overrides: Partial<ParsedCellRecord> = {},
): ParsedCellRecord {
	const item: ParsedVitalsItem = {
		targetSchema: CANONICAL_TAGS.VITALS,
		attributes: {},
		concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		rawText: "temp 37.5C",
		tag: CANONICAL_TAGS.VITALS,
		extractedData: {
			vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
			measurement: {
				magnitude: 37.5,
				unitAnchor: "temperature",
				unit: { display: "Celsius" },
				valueInBase: 310.15,
			},
		},
	};

	return {
		shared: buildShared({ targetSchema: CANONICAL_TAGS.VITALS }),
		parsedItem: item,
		learningMetadata: {
			history: {},
			flags: {},
		},
		...overrides,
	} as ParsedCellRecord;
}

function buildContext(
	history: ParsedCellRecord[],
	targetSchema = CANONICAL_TAGS.OBSERVATION,
	tag = CANONICAL_TAGS.OBSERVATION,
) {
	return {
		tag,
		targetSchema,
		rawText: "temperature 101F",
		history,
	};
}

describe("GenericPreferenceRanker", () => {
	it("score returns 0 for no history", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildObservationRecord();
		const context = buildContext([]);
		const result = ranker.score(candidate, context);
		expect(result.score).toBe(0);
		expect(result.reason).toBe("baseline");
	});

	it("score rewards matching leaf fields via transform", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildObservationRecord({
			parsedItem: {
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				attributes: {},
				concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
				rawText: "temperature 101F",
				tag: CANONICAL_TAGS.OBSERVATION,
				extractedData: {
					certainty: "confirmed",
					status: "present",
					severity: { score: 3, maxScore: 5, normalizedScore: 0.6 },
					duration: { magnitude: 2, unit: "day" },
					trajectory: "worsening",
				},
			} as ParsedObservationItem,
		});

		const history = [
			buildObservationRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.OBSERVATION,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temperature 101F",
					tag: CANONICAL_TAGS.OBSERVATION,
					extractedData: {
						certainty: "confirmed",
						status: "present",
						severity: { score: 3, maxScore: 5, normalizedScore: 0.6 },
						duration: { magnitude: 2, unit: "day" },
						trajectory: "worsening",
					},
				} as ParsedObservationItem,
			}),
		];

		const context = buildContext(history);
		const result = ranker.score(candidate, context);
		expect(result.score).toBeGreaterThan(0);
		expect(result.reason).toContain("conceptId");
		expect(result.reason).toContain("certainty");
	});

	it("score uses statistical proximity for numeric fields", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildVitalsRecord({
			parsedItem: {
				targetSchema: CANONICAL_TAGS.VITALS,
				attributes: {},
				concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
				rawText: "temp 37.5C",
				tag: CANONICAL_TAGS.VITALS,
				extractedData: {
					vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
					measurement: {
						magnitude: 37.5,
						unitAnchor: "temperature",
						unit: { display: "Celsius" },
						valueInBase: 310.15,
					},
				},
			} as ParsedVitalsItem,
		});

		const history = [
			buildVitalsRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.VITALS,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temp 37.2C",
					tag: CANONICAL_TAGS.VITALS,
					extractedData: {
						vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
						measurement: {
							magnitude: 37.2,
							unitAnchor: "temperature",
							unit: { display: "Celsius" },
							valueInBase: 310.05,
						},
					},
				} as ParsedVitalsItem,
			}),
			buildVitalsRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.VITALS,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temp 37.8C",
					tag: CANONICAL_TAGS.VITALS,
					extractedData: {
						vitalType: { conceptId: "LOINC::8310-5", display: "Temperature" },
						measurement: {
							magnitude: 37.8,
							unitAnchor: "temperature",
							unit: { display: "Celsius" },
							valueInBase: 310.35,
						},
					},
				} as ParsedVitalsItem,
			}),
		];

		const context = buildContext(
			history,
			CANONICAL_TAGS.VITALS,
			CANONICAL_TAGS.VITALS,
		);
		const result = ranker.score(candidate, context);
		expect(result.score).toBeGreaterThan(0);
	});

	it("score falls back to exact equality for numeric with insufficient history", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildObservationRecord({
			parsedItem: {
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				attributes: {},
				concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
				rawText: "temperature 101F",
				tag: CANONICAL_TAGS.OBSERVATION,
				extractedData: {
					severity: { score: 5, maxScore: 5, normalizedScore: 1 },
				},
			} as ParsedObservationItem,
		});

		const history = [
			buildObservationRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.OBSERVATION,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temperature 101F",
					tag: CANONICAL_TAGS.OBSERVATION,
					extractedData: {
						severity: { score: 5, maxScore: 5, normalizedScore: 1 },
					},
				} as ParsedObservationItem,
			}),
		];

		const context = buildContext(history);
		const result = ranker.score(candidate, context);
		expect(result.score).toBeGreaterThan(0);
	});

	it("score ignores dropped fields", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildObservationRecord({
			parsedItem: {
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				attributes: {},
				concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
				rawText: "temperature 101F",
				tag: CANONICAL_TAGS.OBSERVATION,
				extractedData: {
					id: "obs-1",
					rawTerm: "temperature",
					certainty: "confirmed",
				},
			} as ParsedObservationItem,
		});

		const history = [
			buildObservationRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.OBSERVATION,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temperature 101F",
					tag: CANONICAL_TAGS.OBSERVATION,
					extractedData: {
						id: "obs-2",
						rawTerm: "temp",
						certainty: "confirmed",
					},
				} as ParsedObservationItem,
			}),
		];

		const context = buildContext(history);
		const result = ranker.score(candidate, context);
		expect(result.score).toBeGreaterThan(0);
		expect(result.reason).toContain("certainty");
		expect(result.reason).not.toContain("id");
		expect(result.reason).not.toContain("rawTerm");
	});

	it("adjustWeights increases on acceptance", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildObservationRecord();
		const history = [
			buildObservationRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.OBSERVATION,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temperature 101F",
					tag: CANONICAL_TAGS.OBSERVATION,
					extractedData: {
						certainty: "confirmed",
					},
				} as ParsedObservationItem,
			}),
		];

		const context = buildContext(history);
		ranker.adjustWeights(candidate, context, true);
		const weights = ranker.getFieldWeights();
		expect(weights.certainty).toBeGreaterThan(1.0);
	});

	it("adjustWeights decreases on rejection", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate = buildObservationRecord();
		const history = [
			buildObservationRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.OBSERVATION,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temperature 101F",
					tag: CANONICAL_TAGS.OBSERVATION,
					extractedData: {
						certainty: "confirmed",
					},
				} as ParsedObservationItem,
			}),
		];

		const context = buildContext(history);
		ranker.adjustWeights(candidate, context, false);
		const weights = ranker.getFieldWeights();
		expect(weights.certainty).toBeLessThan(1.0);
	});

	it("choose returns deterministic winner when mode = deterministic", () => {
		const ranker = new GenericPreferenceRanker();
		const deterministic = buildObservationRecord();
		const learned = buildObservationRecord();
		const context = buildContext([]);
		const result = ranker.choose(
			deterministic,
			learned,
			context,
			"deterministic",
		);
		expect(result.winner).toBe(deterministic);
	});

	it("choose returns learned winner when mode = learned", () => {
		const ranker = new GenericPreferenceRanker();
		const deterministic = buildObservationRecord();
		const learned = buildObservationRecord();
		const context = buildContext([]);
		const result = ranker.choose(deterministic, learned, context, "learned");
		expect(result.winner).toBe(learned);
	});

	it("rankMany sorts by score descending", () => {
		const ranker = new GenericPreferenceRanker();
		const low = buildObservationRecord({
			parsedItem: {
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				attributes: {},
				concept: [{ conceptId: "SNOMED::246072003", display: "Fever" }],
				rawText: "fever",
				tag: CANONICAL_TAGS.OBSERVATION,
				extractedData: { trajectory: "stable" },
			} as ParsedObservationItem,
		});

		const high = buildObservationRecord({
			parsedItem: {
				targetSchema: CANONICAL_TAGS.OBSERVATION,
				attributes: {},
				concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
				rawText: "temperature 101F",
				tag: CANONICAL_TAGS.OBSERVATION,
				extractedData: { trajectory: "worsening" },
			} as ParsedObservationItem,
		});

		const history = [
			buildObservationRecord({
				parsedItem: {
					targetSchema: CANONICAL_TAGS.OBSERVATION,
					attributes: {},
					concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
					rawText: "temperature 101F",
					tag: CANONICAL_TAGS.OBSERVATION,
					extractedData: { trajectory: "worsening" },
				} as ParsedObservationItem,
			}),
		];

		const context = buildContext(history);
		const result = ranker.rankMany(
			[
				{ candidate: low, source: "deterministic" },
				{ candidate: high, source: "learned" },
			],
			context,
		);
		expect(result.candidates[0]?.candidate).toBe(high);
		expect(result.candidates[1]?.candidate).toBe(low);
	});

	it("previewMany groups by source", () => {
		const ranker = new GenericPreferenceRanker();
		const candidate1 = buildObservationRecord();
		const candidate2 = buildObservationRecord();
		const context = buildContext([]);
		const result = ranker.previewMany(
			[
				{ candidate: candidate1, source: "deterministic" },
				{ candidate: candidate2, source: "learned" },
			],
			context,
		);
		expect(result.deterministic).toHaveLength(1);
		expect(result.learned).toHaveLength(1);
	});

	it("get/setFieldWeights round-trips", () => {
		const ranker = new GenericPreferenceRanker();
		ranker.setFieldWeights({ a: 2.0, b: 0.5 });
		const weights = ranker.getFieldWeights();
		expect(weights["a"]).toBe(2.0);
		expect(weights["b"]).toBe(0.5);
	});
});
