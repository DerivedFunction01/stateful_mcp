import { describe, expect, it } from "bun:test";
import { createMeasurementValue } from "../src/v2/values/measurement-value";
import { resolveConceptValue } from "../src/v2/values/concept-value";
import { ValueRuleRegistry } from "../src/v2/values/value-rule-registry";
import { createCadenceValue, createDateRangeValue, createDurationValue } from "../src/v2/values/temporal-value";
import { createAnatomyValue } from "../src/v2/values/anatomy-value";

describe("V2 value foundations", () => {
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
		expect(createMeasurementValue({ dimension: "time", magnitude: 2, unit: "fortnight" }, ["hour"]).diagnostics[0]?.code).toBe("invalid_unit");
		expect(createMeasurementValue({ dimension: "time", magnitude: 2, unit: "hour", dataPointCount: 0 }).diagnostics[0]?.code).toBe("invalid_data_point_count");
	});

	it("resolves concepts and enforces namespace restrictions", async () => {
		const dictionary = {
			search: async () => [{
				id: "c1",
				namespaceCode: "SNOMED",
				standardCode: "29857009",
				display: "Chest pain",
				active: true,
			}],
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

	it("keeps value extraction rules profile-driven and deterministically ordered", () => {
		const registry = new ValueRuleRegistry();
		registry.register("clinical-en", [
			{ ruleId: "low", targetSchema: "Observation", targetPath: "severity.score", valueKind: "scalar", patterns: ["low"], priority: 1 },
			{ ruleId: "high", targetSchema: "Observation", targetPath: "severity.score", valueKind: "scalar", patterns: ["high"], priority: 2 },
		]);

		expect(registry.list("clinical-en", "severity.score").map((rule) => rule.ruleId)).toEqual(["high", "low"]);
		expect(registry.match("clinical-en", "severity.score", "high")[0]?.rule.ruleId).toBe("high");
	});

	it("builds explicit temporal collections and typed anatomy values", () => {
		const measurement = createMeasurementValue({ dimension: "time", magnitude: 2, unit: "hour" }).value!;
		const duration = createDurationValue([measurement]);
		const dateRange = createDateRangeValue({ relativeEstimate: {
			direction: "retrospective",
			firstValue: 2,
			precisionUnit: "day",
		} });
		const cadence = createCadenceValue({ cadenceType: "interval", interval: { multiplier: 8, unit: "hour" }, isPrn: false });
		const anatomy = createAnatomyValue({ anatomy: { conceptId: "SNOMED::51185008", display: "Chest" }, laterality: "left" });

		expect(duration.value).toMatchObject({ kind: "duration", ordered: true });
		expect(dateRange.temporalType).toBe("date_range");
		expect(cadence.temporalType).toBe("cadence");
		expect(anatomy.laterality).toBe("left");
	});
});
