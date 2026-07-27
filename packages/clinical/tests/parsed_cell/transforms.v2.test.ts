import { describe, expect, it } from "bun:test";
import type { ColumnDef, ParsedObservationItem } from "../../src/parser/schema-parsers";
import { CANONICAL_TAGS } from "../../src/parser/schema-parsers";
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

	it("exposes columnSpecs covering all flatten() keys", () => {
		const flat = transform!.flatten(transform!.template());
		const columnSpecs = transform!.columnSpecs as ColumnDef[] | undefined;

		expect(columnSpecs).toBeDefined();
		expect(columnSpecs!.length).toBeGreaterThan(0);

		const specNames = new Set(columnSpecs!.map((c) => c.name));
		for (const key of Object.keys(flat)) {
			expect(specNames.has(key)).toBe(true);
		}
	});
});

describe("vitals-transform", () => {
	const transform = getTransformForSchema(CANONICAL_TAGS.VITALS);

	it("flatten produces expected vitals keys", () => {
		const item = {
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
		const flat = transform!.flatten(item as any);

		expect(flat["vitalType.conceptId"]).toBe("LOINC::8310-5");
		expect(flat["measurement.magnitude"]).toBe(37.5);
		expect(flat["measurement.valueInBase"]).toBe(310.15);
	});

	it("exposes columnSpecs covering all flatten() keys", () => {
		const flat = transform!.flatten(transform!.template());
		const columnSpecs = transform!.columnSpecs as ColumnDef[] | undefined;

		expect(columnSpecs).toBeDefined();
		expect(columnSpecs!.length).toBeGreaterThan(0);

		const specNames = new Set(columnSpecs!.map((c) => c.name));
		for (const key of Object.keys(flat)) {
			expect(specNames.has(key)).toBe(true);
		}
	});
});

describe("medication-transform", () => {
	const transform = getTransformForSchema(CANONICAL_TAGS.MEDICATION);

	it("flatten produces expected medication keys", () => {
		const item = {
			targetSchema: CANONICAL_TAGS.MEDICATION,
			attributes: {},
			concept: [{ conceptId: "RxNorm::723", display: "Amoxicillin" }],
			rawText: "amoxicillin 500mg TID",
			tag: CANONICAL_TAGS.MEDICATION,
			extractedData: {
				medication: { conceptId: "RxNorm::723", display: "Amoxicillin" },
				route: { conceptId: "SNOMED::26643006", display: "Oral" },
				frequency: { text: "TID", interval: { magnitude: 3, unit: "day" } },
				dosage: { text: "500mg", dose: 500, unit: "mg" },
			},
		};
		const flat = transform!.flatten(item as any);

		expect(flat["medication.conceptId"]).toBe("RxNorm::723");
		expect(flat["frequency.interval.magnitude"]).toBe(3);
		expect(flat["dosage.dose"]).toBe(500);
	});

	it("exposes columnSpecs covering all flatten() keys", () => {
		const flat = transform!.flatten(transform!.template());
		const columnSpecs = transform!.columnSpecs as ColumnDef[] | undefined;

		expect(columnSpecs).toBeDefined();
		expect(columnSpecs!.length).toBeGreaterThan(0);

		const specNames = new Set(columnSpecs!.map((c) => c.name));
		for (const key of Object.keys(flat)) {
			expect(specNames.has(key)).toBe(true);
		}
	});
});

describe("clinical-date-range-transform", () => {
	const transform = getTransformForSchema(CANONICAL_TAGS.CLINICAL_DATE_RANGE);

	it("flatten produces expected date range keys", () => {
		const item = {
			targetSchema: CANONICAL_TAGS.CLINICAL_DATE_RANGE,
			attributes: {},
			concept: [],
			rawText: "past 2 weeks",
			tag: CANONICAL_TAGS.CLINICAL_DATE_RANGE,
			extractedData: {
				direction: "past",
				lower: {
					bound: { isInclusive: true, precision: "day" },
					calendarDate: { year: 2024, month: 7, day: 13 },
				},
				upper: {
					bound: { isInclusive: true, precision: "day" },
					calendarDate: { year: 2024, month: 7, day: 27 },
				},
				time: {
					assertedTimestampUtc: "2024-07-27T00:00:00Z",
					precisionLevel: "day",
				},
			},
		};
		const flat = transform!.flatten(item as any);

		expect(flat.direction).toBe("past");
		expect(flat["lower.calendarDate.year"]).toBe(2024);
		expect(flat["upper.calendarDate.day"]).toBe(27);
	});

	it("exposes columnSpecs covering all flatten() keys", () => {
		const flat = transform!.flatten(transform!.template());
		const columnSpecs = transform!.columnSpecs as ColumnDef[] | undefined;

		expect(columnSpecs).toBeDefined();
		expect(columnSpecs!.length).toBeGreaterThan(0);

		const specNames = new Set(columnSpecs!.map((c) => c.name));
		for (const key of Object.keys(flat)) {
			expect(specNames.has(key)).toBe(true);
		}
	});
});
