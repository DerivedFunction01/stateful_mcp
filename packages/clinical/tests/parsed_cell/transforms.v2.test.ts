import { describe, expect, it } from "bun:test";
import type { ParsedObservationItem } from "../../src/parser/schema-parsers.v2";
import { CANONICAL_TAGS } from "../../src/parser/schema-parsers.v2";
import { getTransformForSchema } from "../../src/store/learning/parsed_cell/parsed-cell-record-transform";

import "../../src/store/learning/parsed_cell/transforms/observation-transform";
import "../../src/store/learning/parsed_cell/transforms/vitals-transform";
import "../../src/store/learning/parsed_cell/transforms/medication-transform";
import "../../src/store/learning/parsed_cell/transforms/clinical-date-range-transform";

function buildObservationItem(
	overrides: Partial<ParsedObservationItem> = {},
): ParsedObservationItem {
	return {
		targetSchema: CANONICAL_TAGS.OBSERVATION,
		attributes: {},
		concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		rawText: "temperature 101F",
		tag: CANONICAL_TAGS.OBSERVATION,
		extractedData: {
			id: "obs-1",
			soapSection: "objective",
			concept: { conceptId: "LOINC::8310-5", display: "Temperature" },
			rawTerm: "temperature",
			sourceType: "clinician_observed",
			certainty: "confirmed",
			status: "present",
			severity: {
				score: 3,
				maxScore: 5,
				normalizedScore: 0.6,
			},
			duration: {
				magnitude: 2,
				unit: "days",
				operator: "eq",
				is_approximate: false,
			},
			trajectory: "worsening",
			qualifiers: [{ conceptId: "SNOMED::246072003", display: "Fever" }],
			dateRange: {
				time: {
					assertedTimestampUtc: "2024-01-01T00:00:00Z",
					precisionLevel: "day",
				},
			},
			...overrides,
		},
	} as ParsedObservationItem;
}

describe("observation-transform", () => {
	const transform = getTransformForSchema(CANONICAL_TAGS.OBSERVATION);

	it("produces a stable flat Record<string, any> from ParsedObservationItem", () => {
		const item = buildObservationItem();
		const flat = transform!.flatten(item);

		expect(flat.conceptId).toBe("LOINC::8310-5");
		expect(flat.certainty).toBe("confirmed");
		expect(flat.status).toBe("present");
		expect(flat["severity.score"]).toBe(3);
		expect(flat["severity.maxScore"]).toBe(5);
		expect(flat["severity.normalizedScore"]).toBe(0.6);
		expect(flat["duration.magnitude"]).toBe(2);
		expect(flat["duration.unit"]).toBe("days");
		expect(flat["duration.operator"]).toBe("eq");
		expect(flat["duration.is_approximate"]).toBe(false);
		expect(flat.trajectory).toBe("worsening");
	});

	it("drops dateRange from output", () => {
		const item = buildObservationItem();
		const flat = transform!.flatten(item);

		expect(flat.dateRange).toBeUndefined();
		expect(flat.time).toBeUndefined();
	});

	it("output keys are deterministic for the same input", () => {
		const item = buildObservationItem();
		const flat1 = transform!.flatten(item);
		const flat2 = transform!.flatten(item);

		expect(Object.keys(flat1).sort()).toEqual(Object.keys(flat2).sort());
	});

	it("drops dateRange and related fields from output", () => {
		const item = buildObservationItem();
		const flat = transform!.flatten(item);

		expect(flat.dateRange).toBeUndefined();
		expect(flat.time).toBeUndefined();
		expect(flat.assertedTimestampUtc).toBeUndefined();
	});
});
