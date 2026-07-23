import { describe, expect, test } from "bun:test";
import { getCompiledRegex } from "../src/parser/_compiled-regex";
import {
	buildNumericPatternString,
	compileNumericRegex,
	type NumericFieldFormatOptions,
} from "../src/parser/utils/numeric-regex-generator";
import {
	buildNumericFieldRules,
	NUMERIC_FIELD_SEVERITY_0_10,
	NUMERIC_PATTERN_DENOMINATOR,
	NUMERIC_PATTERN_NUMERATOR,
	NUMERIC_PATTERN_PERCENTAGE_0_100,
	NUMERIC_PATTERN_QUANTITY,
	NUMERIC_PATTERN_SEVERITY_0_10,
} from "../src/store/defaults";

describe("buildNumericPatternString", () => {
	test("returns default unbounded numeric pattern", () => {
		const pattern = buildNumericPatternString();
		expect(pattern).toBe("-?\\d+(?:\\.\\d+)?");
	});

	test("wraps in named capture group when groupName is provided", () => {
		const pattern = buildNumericPatternString({ groupName: "severity" });
		expect(pattern).toBe("(?<severity>-?\\d+(?:\\.\\d+)?)");
	});

	test("returns unwrapped fragment when wrap is false", () => {
		const pattern = buildNumericPatternString({
			groupName: "severity",
			wrap: false,
		});
		expect(pattern).toBe("-?\\d+(?:\\.\\d+)?");
	});

	test("respects integerDigits and decimalDigits", () => {
		const pattern = buildNumericPatternString({
			integerDigits: 1,
			decimalDigits: 0,
		});
		expect(pattern).toBe("\\d{1}");
	});

	test("supports leadingMin and leadingMax", () => {
		const pattern = buildNumericPatternString({
			leadingMin: 0,
			leadingMax: 1,
		});
		expect(pattern).toBe("-?[0-1]?\\d+(?:\\.\\d+)?");
	});

	test("adds decimal lookahead when exact is true and decimalDigits is 0", () => {
		const pattern = buildNumericPatternString({
			integerDigits: 2,
			decimalDigits: 0,
			exact: true,
		});
		expect(pattern).toBe("^\\d{2}(?!\\.)$");
	});

	test("supports currency prefix", () => {
		const pattern = buildNumericPatternString({
			currencySymbols: ["$", "€"],
			currencyPosition: "prefix",
		});
		expect(pattern).toBe("(?:-?(?:\\$|€)?|(?:\\$|€)-)?\\d+(?:\\.\\d+)?");
	});

	test("supports parenthesized negatives", () => {
		const pattern = buildNumericPatternString({
			allowNegative: true,
			negativeStyle: "parens",
		});
		expect(pattern).toBe("(?:-?\\d+(?:\\.\\d+)?|\\(\\d+(?:\\.\\d+)?\\))");
	});
});

describe("compileNumericRegex", () => {
	test("compiles through memoized cache", () => {
		const first = compileNumericRegex("\\d+", "gi");
		const second = compileNumericRegex("\\d+", "gi");
		expect(first).toBe(second);
	});
});

describe("numeric pattern constants", () => {
	test("NUMERIC_PATTERN_SEVERITY_0_10 returns named group with bounded digits", () => {
		expect(NUMERIC_PATTERN_SEVERITY_0_10).toBe("(?<severity>[0-1]?\\d{1})");
	});

	test("NUMERIC_PATTERN_PERCENTAGE_0_100 returns named group", () => {
		expect(NUMERIC_PATTERN_PERCENTAGE_0_100).toBe(
			"(?<percentage>[0-1]?\\d{3})",
		);
	});

	test("NUMERIC_PATTERN_NUMERATOR returns named group", () => {
		expect(NUMERIC_PATTERN_NUMERATOR).toBe("(?<numerator>\\d+)");
	});

	test("NUMERIC_PATTERN_DENOMINATOR returns named group", () => {
		expect(NUMERIC_PATTERN_DENOMINATOR).toBe("(?<denominator>\\d+)");
	});

	test("NUMERIC_PATTERN_QUANTITY returns named group", () => {
		expect(NUMERIC_PATTERN_QUANTITY).toBe("(?<quantity>\\d+(?:\\.\\d+)?)");
	});
});

describe("buildNumericFieldRules", () => {
	test("generates AttributeParserRule entries", () => {
		const formats: NumericFieldFormatOptions[] = [
			{
				integerDigits: 1,
				decimalDigits: 0,
				allowNegative: false,
				targetField: "severity_score",
				priority: 100,
			},
		];
		const rules = buildNumericFieldRules(formats);
		expect(rules).toHaveLength(1);
		expect(rules[0]?.targetField).toBe("severity_score");
		expect(rules[0]?.targetValue).toBe("number");
		expect(rules[0]?.regexPatterns).toHaveLength(1);
		expect(rules[0]?.priority).toBe(100);
	});

	test("sorts rules by priority descending", () => {
		const formats: NumericFieldFormatOptions[] = [
			{ targetField: "low" as any, priority: 1 },
			{ targetField: "high" as any, priority: 10 },
		];
		const rules = buildNumericFieldRules(formats);
		expect(rules[0]?.targetField).toBe("high");
		expect(rules[1]?.targetField).toBe("low");
		expect(rules[0]?.targetValue).toBe("number");
	});
});

describe("numeric regex memoization", () => {
	test("AttributeParserRule patterns compile through getCompiledRegex cache", () => {
		const rules = buildNumericFieldRules([NUMERIC_FIELD_SEVERITY_0_10]);
		const pattern = rules[0]?.regexPatterns[0];
		if (!pattern) return;

		const first = getCompiledRegex(pattern, "gi");
		const second = getCompiledRegex(pattern, "gi");
		expect(first).toBe(second);
	});
});
