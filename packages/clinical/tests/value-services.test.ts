import { describe, expect, it } from "bun:test";
import { createAnatomyValue } from "../src/values/anatomy-value";
import { resolveConceptValue } from "../src/values/concept-value";
import {
	createCompoundMeasurementValue,
	createMeasurementValue,
	createMeasurementValueFromQuantity,
} from "../src/values/measurement-value";
import {
	createCadenceValue,
	createDateRangeValue,
	createDurationValue,
} from "../src/values/temporal-value";
import { ValueRuleRegistry } from "../src/values/value-rule-registry";

describe(" value foundations", () => {
	it("creates measurement values with statistical metadata", () => {
		const result = createMeasurementValue(
			{
				dimension: "time",
				magnitude: 2,
				unit: "hour",
				statisticalType: "mean",
				operator: "gte",
				isApproximate: true,
				dataPointCount: 3,
			},
			["hour", "day"],
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.value).toMatchObject({
			kind: "measurement",
			statisticalType: "mean",
			operator: "gte",
			dataPointCount: 3,
		});
	});

	it("requires valid measurement units and data-point counts", () => {
		expect(
			createMeasurementValue(
				{ dimension: "time", magnitude: 2, unit: "fortnight" },
				["hour"],
			).diagnostics[0]?.code,
		).toBe("invalid_unit");
		expect(
			createMeasurementValue({
				dimension: "time",
				magnitude: 2,
				unit: "hour",
				dataPointCount: 0,
			}).diagnostics[0]?.code,
		).toBe("invalid_data_point_count");
	});

	it("resolves concepts and enforces namespace restrictions", async () => {
		const dictionary = {
			search: async () => [
				{
					id: "c1",
					namespaceCode: "SNOMED",
					standardCode: "29857009",
					display: "Chest pain",
					active: true,
				},
			],
		};
		const resolved = await resolveConceptValue("SNOMED::29857009", dictionary, {
			allowedNamespaces: ["SNOMED"],
		});
		const rejected = await resolveConceptValue("SNOMED::29857009", dictionary, {
			allowedNamespaces: ["LOINC"],
		});

		expect(resolved.value?.concept.conceptId).toBe("c1");
		expect(rejected.diagnostics[0]?.code).toBe("concept_namespace_invalid");
	});

	it("resolves exact custom expression aliases to their canonical concept", async () => {
		const dictionary = {
			search: async (query: string) =>
				query.toLowerCase() === "harry potter"
					? [
							{
								id: "c-harry-potter",
								namespaceCode: "BOOK",
								standardCode: "HP",
								display: "Harry Potter",
								active: true,
							},
						]
					: [],
			searchExpressionCandidates: async () => [
				{
					id: "expr-hp",
					term: "Harry Potter",
					lookupTerm: "hp",
					regexPattern: "\\\\bhp\\\\b",
					isCaseInsensitive: true,
					conceptId: "c-harry-potter",
					priorityWeight: 1,
					active: true,
				},
			],
		};

		const resolved = await resolveConceptValue("hp", dictionary, {});

		expect(resolved.diagnostics).toEqual([]);
		expect(resolved.value?.concept).toEqual({
			conceptId: "c-harry-potter",
			display: "Harry Potter",
		});
	});

	it("rejects unrestricted ambiguous concept text", async () => {
		const dictionary = {
			search: async () => [
				{
					id: "c-right-anatomy",
					namespaceCode: "SNOMED",
					standardCode: "R-ANATOMY",
					display: "Right",
					active: true,
				},
				{
					id: "c-right-direction",
					namespaceCode: "LOCAL",
					standardCode: "R-DIRECTION",
					display: "Right",
					active: true,
				},
			],
		};

		const result = await resolveConceptValue("right", dictionary);

		expect(result.value).toBeUndefined();
		expect(result.diagnostics[0]?.code).toBe("concept_ambiguous");
	});

	it("converts a shared scalar quantity into a measurement value", () => {
		const result = createMeasurementValueFromQuantity(
			{
				lower: 20,
				unit: "cm",
				rawText: "20 cm",
			},
			{ dimension: "length" },
			{ allowRange: false, statistics: "reject", allowDataPointCount: false },
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.value).toMatchObject({
			kind: "measurement",
			magnitude: 20,
			unit: "cm",
			dimension: "length",
		});
	});

	it("preserves an allowed quantity range in a measurement value", () => {
		const result = createMeasurementValueFromQuantity(
			{
				lower: 3,
				upper: 6,
				unit: "month",
				rawText: "3 to 6 months",
			},
			{ dimension: "time" },
			{ allowRange: true, statistics: "reject", allowDataPointCount: false },
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.value?.range).toEqual({
			lower: 3,
			upper: 6,
			unit: "month",
		});
	});

	it("composes compound measurements without discarding components", () => {
		const result = createCompoundMeasurementValue([
			{
				key: "systolic",
				value: {
					kind: "measurement",
					dimension: "pressure",
					magnitude: 120,
					unit: "mmHg",
				},
			},
			{
				key: "diastolic",
				value: {
					kind: "measurement",
					dimension: "pressure",
					magnitude: 80,
					unit: "mmHg",
				},
			},
		]);

		expect(result.diagnostics).toEqual([]);
		expect(result.value?.values.systolic).toMatchObject({ magnitude: 120 });
		expect(result.value?.values.diastolic).toMatchObject({ magnitude: 80 });
	});

	it("resolves a canonical concept prefix when no longer expression continues it", async () => {
		const dictionary = {
			search: async () => [
				{
					id: "c-harry-potter",
					namespaceCode: "BOOK",
					standardCode: "HP",
					display: "Harry Potter",
					active: true,
				},
			],
			searchExpressionCandidates: async () => [
				{
					id: "expr-hp",
					term: "Harry Potter",
					lookupTerm: "harry potter",
					conceptId: "c-harry-potter",
					active: true,
				},
			],
		};

		const resolved = await resolveConceptValue(
			"harry potter and the",
			dictionary,
			{},
		);

		expect(resolved.diagnostics).toEqual([]);
		expect(resolved.value?.concept.conceptId).toBe("c-harry-potter");
	});

	it("keeps value extraction rules profile-driven and deterministically ordered", () => {
		const registry = new ValueRuleRegistry();
		registry.register("clinical-en", [
			{
				ruleId: "low",
				targetSchema: "Observation",
				targetPath: "severity.score",
				valueKind: "scalar",
				patterns: ["low"],
				priority: 1,
			},
			{
				ruleId: "high",
				targetSchema: "Observation",
				targetPath: "severity.score",
				valueKind: "scalar",
				patterns: ["high"],
				priority: 2,
			},
		]);

		expect(
			registry.list("clinical-en", "severity.score").map((rule) => rule.ruleId),
		).toEqual(["high", "low"]);
		expect(
			registry.match("clinical-en", "severity.score", "high")[0]?.rule.ruleId,
		).toBe("high");
	});

	it("builds explicit temporal collections and typed anatomy values", () => {
		const measurement = createMeasurementValue({
			dimension: "time",
			magnitude: 2,
			unit: "hour",
		}).value!;
		const duration = createDurationValue([measurement]);
		const dateRange = createDateRangeValue({
			relativeEstimate: {
				direction: "retrospective",
				firstValue: 2,
				precisionUnit: "day",
			},
		});
		const cadence = createCadenceValue({
			cadenceType: "interval",
			interval: { multiplier: 8, unit: "hour" },
			isPrn: false,
		});
		const anatomy = createAnatomyValue({
			anatomy: { conceptId: "SNOMED::51185008", display: "Chest" },
			laterality: "left",
		});

		expect(duration.value).toMatchObject({ kind: "duration", ordered: true });
		expect(dateRange.temporalType).toBe("date_range");
		expect(cadence.temporalType).toBe("cadence");
		expect(anatomy.laterality).toBe("left");
	});
});
