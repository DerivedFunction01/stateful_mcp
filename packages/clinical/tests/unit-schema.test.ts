import { describe, expect, test } from "bun:test";
import {
	MeasurementHelper,
	QuantityTokenizer,
	TimeHelper,
} from "../src/parser/helpers/measurement-helper";
import type {
	MassMeasurement,
	TemperatureMeasurement,
} from "../src/schemas/measurement";
import { DEFAULT_ATTRIBUTE_RULES } from "../src/store/defaults";
import type { AttributeParserRule } from "../src/store/interfaces";

describe("Strongly-Typed Measurement Units & parseAs Helper", () => {
	test("should parse MassMeasurement correctly using parseAs", () => {
		const candidates = QuantityTokenizer.tokenize(
			"50 milligram",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed = MeasurementHelper.parseAs<MassMeasurement>(
			candidates[0],
			"mass",
			DEFAULT_ATTRIBUTE_RULES,
		);
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("mass");
		expect(parsed!.magnitude).toBe(50);
		expect(parsed!.unit!.display).toBe("mg");
	});

	test("should parse TemperatureMeasurement correctly using parseAs", () => {
		const candidates = QuantityTokenizer.tokenize(
			"37.5 Celsius",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>(
			candidates[0],
			"temperature",
			DEFAULT_ATTRIBUTE_RULES,
		);
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("temperature");
		expect(parsed!.magnitude).toBe(37.5);
		expect(parsed!.unit!.display).toBe("Celsius");
	});

	test("should return null when parsing mismatching unit anchor", () => {
		// 120 mmHg is pressure, not temperature
		const candidates = QuantityTokenizer.tokenize(
			"120 mmHg",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>(
			candidates[0],
			"temperature",
			DEFAULT_ATTRIBUTE_RULES,
		);
		expect(parsed).toBeNull();
	});

	test("should typecheck unit assignments correctly", () => {
		// Valid compile-time types (testing that we can declare these types compile-time cleanly)
		const mass: MassMeasurement = {
			magnitude: 10,
			unitAnchor: "mass",
			unit: { display: "kg" },
		};
		expect(mass.unit!.display).toBe("kg");

		const temp: TemperatureMeasurement = {
			magnitude: 37,
			unitAnchor: "temperature",
			unit: { display: "Celsius" },
		};
		expect(temp.unit!.display).toBe("Celsius");
	});

	test("should return all candidates when multiple rules match", () => {
		const customRules: AttributeParserRule[] = [
			{
				targetField: "unit",
				targetValue: "mg",
				regexPatterns: ["\\b(?<magnitude>\\d+)\\s*(?<unit>mg)\\b"],
				unitAnchor: "mass",
				priority: 2,
			},
			{
				targetField: "unit",
				targetValue: "g",
				regexPatterns: ["\\b(?<magnitude>\\d+)\\s*(?<unit>g)\\b"],
				unitAnchor: "mass",
				priority: 5,
			},
		];
		// mg rule matches "10 mg"; g rule does not match inside "mg" (word boundary)
		const priorityCandidates = QuantityTokenizer.tokenize(
			"10 mg",
			customRules,
		);
		const mgCandidate = priorityCandidates.find(
			(c) => c.rawUnit === "mg",
		);
		expect(mgCandidate).toBeDefined();
		expect(mgCandidate!.magnitude).toBe(10);
	});

	test("should use negative lookahead to prevent time unit durations from matching relative offset indicators", () => {
		// "3 weeks" should match the time_unit "week"
		const candidates1 = QuantityTokenizer.tokenize(
			"3 weeks",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed1 = candidates1[0]
			? TimeHelper.parse(candidates1[0], DEFAULT_ATTRIBUTE_RULES)
			: null;
		expect(parsed1).not.toBeNull();
		expect(parsed1!.unit).toBe("week");

		// "3 weeks ago" contains "weeks" but has "ago", so it should NOT match the base time_unit rule
		const candidates2 = QuantityTokenizer.tokenize(
			"3 weeks ago",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed2 = candidates2[0]
			? TimeHelper.parse(candidates2[0], DEFAULT_ATTRIBUTE_RULES)
			: null;
		expect(parsed2).toBeNull();
	});

	test("should allow a deterministic seed time for current timestamp generation", () => {
		const fixedTime = new Date("2024-01-02T03:04:05.000Z");
		const boundary = TimeHelper.getCurrentTimestamp("second", fixedTime);
		expect(boundary.assertedTimestampUtc).toBe("2024-01-02T03:04:05.000Z");
		expect(boundary.precisionLevel).toBe("second");
	});

	test("should tokenize quantities with position-independent operators and units", () => {
		const approxPrefix = QuantityTokenizer.tokenize(
			"approx 30 mm",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const approxMagnitude = approxPrefix.find((c) => c.magnitude === 30);
		expect(approxMagnitude?.magnitude).toBe(30);
		expect(approxMagnitude?.isApproximate).toBe(true);
		expect(approxPrefix.some((c) => c.rawUnit === "mm")).toBe(true);

		const approxSuffix = QuantityTokenizer.tokenize(
			"30 mm approximately",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const approxSuffixMagnitude = approxSuffix.find((c) => c.magnitude === 30);
		expect(approxSuffixMagnitude?.magnitude).toBe(30);
		expect(approxSuffixMagnitude?.isApproximate).toBe(true);
		expect(approxSuffix.some((c) => c.rawUnit === "mm")).toBe(true);

		const approxJapanese = QuantityTokenizer.tokenize(
			"30 mm 程度",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const approxJapaneseMagnitude = approxJapanese.find((c) => c.magnitude === 30);
		expect(approxJapaneseMagnitude?.magnitude).toBe(30);
		expect(approxJapaneseMagnitude?.isApproximate).toBe(true);
		expect(approxJapanese.some((c) => c.rawUnit === "mm")).toBe(true);

		const rtl = QuantityTokenizer.tokenize("10 <", DEFAULT_ATTRIBUTE_RULES);
		const rtlCandidate = rtl.find((c) => c.magnitude === 10);
		expect(rtlCandidate?.magnitude).toBe(10);
		expect(rtlCandidate?.operator).toBe("<");
		expect(rtlCandidate?.rawUnit).toBeUndefined();

		const chinese = QuantityTokenizer.tokenize(
			"大约30毫米",
			DEFAULT_ATTRIBUTE_RULES,
		);
		const chineseMagnitude = chinese.find((c) => c.magnitude === 30);
		expect(chineseMagnitude?.magnitude).toBe(30);
		expect(chineseMagnitude?.isApproximate).toBe(true);
		expect(chinese.some((c) => c.rawUnit === "毫米")).toBe(true);
	});
});
