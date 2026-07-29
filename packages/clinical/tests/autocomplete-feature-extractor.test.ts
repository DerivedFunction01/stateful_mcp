import { describe, expect, test } from "bun:test";
import {
	extractConceptFeature,
	extractFeatures,
	extractMeasurementFeature,
	extractObjectFeatures,
	extractTermFeatures,
} from "../src/parser/helpers/autocomplete-feature-extractor";

describe("Autocomplete Feature Extractors", () => {
	test("extractConceptFeature gets SNOMED IDs", () => {
		const f1 = extractConceptFeature("SNOMED::423341008");
		expect(f1).toHaveLength(1);
		expect(f1[0]!.key).toBe("concept");
		expect(f1[0]!.value).toBe("SNOMED::423341008");

		const f2 = extractConceptFeature({ conceptId: "SNOMED::111" });
		expect(f2).toHaveLength(1);
		expect(f2[0]!.value).toBe("SNOMED::111");

		const f3 = extractConceptFeature({
			concept: [{ conceptId: "SNOMED::222" }, { conceptId: "SNOMED::333" }],
		});
		expect(f3).toHaveLength(2);
		expect(f3[0]!.value).toBe("SNOMED::222");
		expect(f3[1]!.value).toBe("SNOMED::333");
	});

	test("extractMeasurementFeature normalizes temperatures and magnitudes", () => {
		// 100 Fahrenheit converts to base Kelvin
		const f = extractMeasurementFeature({
			magnitude: 100,
			unit: "Fahrenheit",
			anchor: "temperature",
		});
		expect(f).toHaveLength(1);
		expect(f[0]!.key).toBe("measurement:temperature");
		expect(f[0]!.numericalValue).toBeCloseTo(310.9277, 3);
	});

	test("extractObjectFeatures extracts non-standard primitive keys", () => {
		const f = extractObjectFeatures({
			route: "oral",
			dosage: "50mg",
			concept: [{ conceptId: "123" }], // ignored
			anchor: "temp", // ignored
		});
		expect(f).toHaveLength(2);
		expect(f.some((x) => x.key === "obj_key:route" && x.value === "oral")).toBe(
			true,
		);
		expect(
			f.some((x) => x.key === "obj_key:dosage" && x.value === "50mg"),
		).toBe(true);
	});

	test("extractTermFeatures filters stop words and splits tokens", () => {
		const stops = new Set(["the", "and", "is"]);
		const f = extractTermFeatures("The Chest Pain is acute", stops);
		// "The" -> lower -> stop, "is" -> stop, leaves ["chest", "pain", "acute"]
		expect(f).toHaveLength(3);
		expect(f[0]!.value).toBe("chest");
		expect(f[1]!.value).toBe("pain");
		expect(f[2]!.value).toBe("acute");
	});

	test("extractFeatures aggregates all sub-extractor features", () => {
		const stops = new Set(["with"]);
		const value = {
			conceptId: "SNOMED::123",
			magnitude: 37,
			unit: "Celsius",
			anchor: "temperature",
			status: "active",
			rawText: "Fever with chills",
		};
		const f = extractFeatures(value, stops);
		// Should find:
		// 1. Concept: SNOMED::123
		// 2. Measurement: temperature (37 Celsius = 310.15 Kelvin)
		// 3. Obj_key: status = active
		// 4. Term: fever, chills (with is filtered out)
		expect(
			f.some((x) => x.key === "concept" && x.value === "SNOMED::123"),
		).toBe(true);
		expect(
			f.some(
				(x) =>
					x.key === "measurement:temperature" && x.numericalValue === 310.15,
			),
		).toBe(true);
		expect(
			f.some((x) => x.key === "obj_key:status" && x.value === "active"),
		).toBe(true);
		expect(f.some((x) => x.key === "term" && x.value === "fever")).toBe(true);
		expect(f.some((x) => x.key === "term" && x.value === "chills")).toBe(true);
	});
});
