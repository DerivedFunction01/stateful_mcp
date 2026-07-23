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
		const token = QuantityTokenizer.tokenize(
			"50 milligram",
			[],
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed = MeasurementHelper.parseAs<MassMeasurement>(
			token!,
			"mass",
			DEFAULT_ATTRIBUTE_RULES,
		);
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("mass");
		expect(parsed!.magnitude).toBe(50);
		expect(parsed!.unit!.display).toBe("mg");
	});

	test("should parse TemperatureMeasurement correctly using parseAs", () => {
		const token = QuantityTokenizer.tokenize(
			"37.5 Celsius",
			[],
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>(
			token!,
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
		const token = QuantityTokenizer.tokenize(
			"120 mmHg",
			[],
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>(
			token!,
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

	test("should respect blacklistPatterns to avoid matching blacklisted units", () => {
		const customRules: AttributeParserRule[] = [
			{
				targetField: "unit",
				targetValue: "mg",
				regexPatterns: ["mg"],
				blacklistPatterns: ["mcg", "mg/dL"],
				unitAnchor: "mass",
			},
		];
		// "mg" should match
		const token1 = QuantityTokenizer.tokenize("10 mg", [], customRules);
		const parsed1 = MeasurementHelper.parse(token1!, undefined, customRules);
		expect(parsed1).not.toBeNull();
		expect(parsed1!.unit?.display).toBe("mg");

		// "mg/dL" contains "mg" but is blacklisted, so it should NOT match the mg rule
		const token2 = QuantityTokenizer.tokenize("10 mg/dL", [], customRules);
		const parsed2 = MeasurementHelper.parse(token2!, undefined, customRules);
		expect(parsed2?.unit?.display).not.toBe("mg");
	});

	test("should respect rule priority when matching units", () => {
		const customRules: AttributeParserRule[] = [
			{
				targetField: "unit",
				targetValue: "mg",
				regexPatterns: ["mg"],
				unitAnchor: "mass",
				priority: 2,
			},
			{
				targetField: "unit",
				targetValue: "g",
				regexPatterns: ["g"],
				unitAnchor: "mass",
				priority: 5, // Higher priority wins!
			},
		];
		// "mg" matches both "mg" and "g". Since "g" rule has higher priority, it wins and resolves to "g".
		const token = QuantityTokenizer.tokenize("10 mg", [], customRules);
		const parsed = MeasurementHelper.parse(token!, undefined, customRules);
		expect(parsed).not.toBeNull();
		expect(parsed!.unit?.display).toBe("g");
	});

	test("should use negative lookahead to prevent time unit durations from matching relative offset indicators", () => {
		// "3 weeks" should match the time_unit "week"
		const token1 = QuantityTokenizer.tokenize(
			"3 weeks",
			[],
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed1 = TimeHelper.parse(token1!, DEFAULT_ATTRIBUTE_RULES);
		expect(parsed1).not.toBeNull();
		expect(parsed1!.unit).toBe("week");

		// "3 weeks ago" contains "weeks" but has "ago", so it should NOT match the base time_unit rule
		const token2 = QuantityTokenizer.tokenize(
			"3 weeks ago",
			[],
			DEFAULT_ATTRIBUTE_RULES,
		);
		const parsed2 = TimeHelper.parse(token2!, DEFAULT_ATTRIBUTE_RULES);
		expect(parsed2).toBeNull();
	});

	test("should allow a deterministic seed time for current timestamp generation", () => {
		const fixedTime = new Date("2024-01-02T03:04:05.000Z");
		const boundary = TimeHelper.getCurrentTimestamp("second", fixedTime);
		expect(boundary.assertedTimestampUtc).toBe("2024-01-02T03:04:05.000Z");
		expect(boundary.precisionLevel).toBe("second");
	});

	test("should tokenize quantities with position-independent operators and units", () => {
		const approxPrefix = QuantityTokenizer.tokenize("approx 30 mm", [], DEFAULT_ATTRIBUTE_RULES);
		expect(approxPrefix?.magnitude).toBe(30);
		expect(approxPrefix?.isApproximate).toBe(true);
		expect(approxPrefix?.rawUnit).toBe("mm");

		const approxSuffix = QuantityTokenizer.tokenize("30 mm approximately", [], DEFAULT_ATTRIBUTE_RULES);
		expect(approxSuffix?.magnitude).toBe(30);
		expect(approxSuffix?.isApproximate).toBe(true);
		expect(approxSuffix?.rawUnit).toBe("mm");

		const approxJapanese = QuantityTokenizer.tokenize("30 mm 程度", [], DEFAULT_ATTRIBUTE_RULES);
		expect(approxJapanese?.magnitude).toBe(30);
		expect(approxJapanese?.isApproximate).toBe(true);
		expect(approxJapanese?.rawUnit).toBe("mm");

		const rtl = QuantityTokenizer.tokenize("10 <", [], DEFAULT_ATTRIBUTE_RULES);
		expect(rtl?.magnitude).toBe(10);
		expect(rtl?.operator).toBe("lt");
		expect(rtl?.rawUnit).toBeUndefined();

		const chinese = QuantityTokenizer.tokenize("大约30毫米", [], DEFAULT_ATTRIBUTE_RULES);
		expect(chinese?.magnitude).toBe(30);
		expect(chinese?.isApproximate).toBe(true);
		expect(chinese?.rawUnit).toBe("毫米");
	});
});
