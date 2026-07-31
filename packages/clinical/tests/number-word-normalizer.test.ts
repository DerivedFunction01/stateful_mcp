// Import from bun
import { describe, expect, it } from "bun:test";
import type { NumberWordConfig } from "../src/parser/utils/number-word-normalizer";
import {
	NumberWordNormalizer,
	UniversalNumberParser,
} from "../src/parser/utils/number-word-normalizer";

const ENGLISH_CONFIG: NumberWordConfig = {
	atoms: {
		0: "zero",
		1: "one",
		2: "two",
		3: "three",
		4: "four",
		5: "five",
		6: "six",
		7: "seven",
		8: "eight",
		9: "nine",
		10: "ten",
		11: "eleven",
		12: "twelve",
		13: "thirteen",
		14: "fourteen",
		15: "fifteen",
		16: "sixteen",
		17: "seventeen",
		18: "eighteen",
		19: "nineteen",
		20: "twenty",
		30: "thirty",
		40: "forty",
		50: "fifty",
		60: "sixty",
		70: "seventy",
		80: "eighty",
		90: "ninety",
	},
	scales: [
		{ value: 1000000, word: "million", type: "major" },
		{ value: 1000, word: "thousand", type: "major" },
		{ value: 100, word: "hundred", type: "minor" },
	],
	conjunctions: ["and"],
	protectedPatterns: [],
	useWordBoundaries: true,
};

const ENGLISH_CONFIG_WITH_PHRASES: NumberWordConfig = {
	...ENGLISH_CONFIG,
	phrases: [
		{ value: 2, word: "a couple" },
		{ value: 3, word: "a few" },
		{ value: 2, word: "some" },
		{ value: 3, word: "several" },
	],
};

describe("UniversalNumberParser", () => {
	const parser = new UniversalNumberParser(ENGLISH_CONFIG);

	it("parses single-digit numbers", () => {
		expect(parser.evaluateTokens("one")).toBe(1);
		expect(parser.evaluateTokens("five")).toBe(5);
		expect(parser.evaluateTokens("nine")).toBe(9);
	});

	it("parses teen numbers", () => {
		expect(parser.evaluateTokens("eleven")).toBe(11);
		expect(parser.evaluateTokens("fifteen")).toBe(15);
		expect(parser.evaluateTokens("nineteen")).toBe(19);
	});

	it("parses tens", () => {
		expect(parser.evaluateTokens("twenty")).toBe(20);
		expect(parser.evaluateTokens("thirty")).toBe(30);
		expect(parser.evaluateTokens("ninety")).toBe(90);
	});

	it("parses compound tens-units", () => {
		expect(parser.evaluateTokens("twenty-one")).toBe(21);
		expect(parser.evaluateTokens("forty-five")).toBe(45);
		expect(parser.evaluateTokens("ninety-nine")).toBe(99);
	});

	it("parses hundreds", () => {
		expect(parser.evaluateTokens("one hundred")).toBe(100);
		expect(parser.evaluateTokens("three hundred")).toBe(300);
		expect(parser.evaluateTokens("nine hundred ninety-nine")).toBe(999);
	});

	it("parses thousands", () => {
		expect(parser.evaluateTokens("one thousand")).toBe(1000);
		expect(parser.evaluateTokens("two thousand")).toBe(2000);
		expect(parser.evaluateTokens("twenty-two thousand")).toBe(22000);
	});

	it("parses millions", () => {
		expect(parser.evaluateTokens("one million")).toBe(1000000);
		expect(parser.evaluateTokens("three million")).toBe(3000000);
	});

	it("parses complex numbers", () => {
		expect(
			parser.evaluateTokens(
				"three million four hundred thousand and twenty-two",
			),
		).toBe(3400022);
		expect(parser.evaluateTokens("forty-five")).toBe(45);
	});

	it("parses compound tens-units as a single sequence", () => {
		const text =
			"The patient has fever that lasted for two hundred and twenty-three seconds.";
		const results = parser.extractAndParse(text);
		const compound = results.find((r) => r.value === 223);
		expect(compound).toBeDefined();
		expect(compound!.text).toBe("two hundred and twenty-three");
	});

	it("extracts numbers from text", () => {
		const text =
			"The company sold three million four hundred thousand and twenty-two units, beating the previous record of forty-five.";
		const results = parser.extractAndParse(text);
		const values = results.map((r) => r.value);
		expect(values).toContain(3400022);
		expect(values).toContain(45);
	});
});

describe("NumberWordNormalizer", () => {
	it("returns original text when no config provided", () => {
		const normalizer = new NumberWordNormalizer(null);
		const result = normalizer.normalize("take 2 tablets");
		expect(result.normalizedText).toBe("take 2 tablets");
		expect(result.replacements).toHaveLength(0);
	});

	it("normalizes number words to numerals", () => {
		const normalizer = new NumberWordNormalizer(ENGLISH_CONFIG);
		const result = normalizer.normalize("take two tablets");
		expect(result.normalizedText).toBe("take 2 tablets");
		expect(result.replacements).toHaveLength(1);
		expect(result.replacements[0]!.original).toBe("two");
		expect(result.replacements[0]!.value).toBe(2);
	});

	it("normalizes approximate quantifiers", () => {
		const normalizer = new NumberWordNormalizer(ENGLISH_CONFIG_WITH_PHRASES);
		const result = normalizer.normalize("a few tablets");
		expect(result.normalizedText).toBe("3 tablets");
		expect(result.replacements).toHaveLength(1);
		expect(result.replacements[0]!.original).toBe("a few");
		expect(result.replacements[0]!.value).toBe(3);
	});

	it("handles multiple number words in one text", () => {
		const normalizer = new NumberWordNormalizer(ENGLISH_CONFIG);
		const result = normalizer.normalize("take two tablets three times a day");
		expect(result.normalizedText).toBe("take 2 tablets 3 times a day");
		expect(result.replacements).toHaveLength(2);
		expect(result.replacements[0]!.value).toBe(2);
		expect(result.replacements[1]!.value).toBe(3);
	});
});
