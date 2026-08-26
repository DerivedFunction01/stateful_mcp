import { describe, expect, test } from "bun:test";
import {
	extractPostfixAlias,
	extractPrefixAlias,
	flattenAndSortAliases,
	splitByDelimiters,
} from "../../src/values/token-matcher";

describe("Universal Token Matcher & Memoization Engine (token-matcher.ts)", () => {
	test("memoizes flattened and sorted aliases by object reference equality", () => {
		const unitConfig = {
			mg: ["milligram", "mg", "miligramos"],
			kg: ["kilogram", "kg", "kilogramos"],
			g: ["gram", "g"],
		};

		const firstResult = flattenAndSortAliases(unitConfig, true);
		const secondResult = flattenAndSortAliases(unitConfig, true);

		// Must be the identical object reference in memory (WeakMap cache hit)
		expect(firstResult).toBe(secondResult);
		expect(firstResult).toHaveLength(8); // deduplicated unique aliases + keys
		expect(firstResult[0]?.alias.length).toBe(10); // Longest alias first (10 chars)

		// Distinct includeKeyAsAlias parameter maintains separate memoized instance
		const withoutKeys = flattenAndSortAliases(unitConfig, false);
		expect(withoutKeys).not.toBe(firstResult);
		expect(withoutKeys).toHaveLength(8); // 8 distinct aliases across the 3 keys

		const secondWithoutKeys = flattenAndSortAliases(unitConfig, false);
		expect(secondWithoutKeys).toBe(withoutKeys);
	});

	test("extracts prefix aliases using cached compiled regexes", () => {
		const operatorConfig = {
			greater_equal: [">=", "at least", "al menos"],
			less_equal: ["<=", "at most"],
		};

		const sorted = flattenAndSortAliases(operatorConfig, false);

		const match1 = extractPrefixAlias("at least 50 mg", sorted);
		expect(match1?.key).toBe("greater_equal");
		expect(match1?.matchedAlias).toBe("at least");
		expect(match1?.remainderText).toBe("50 mg");

		const match2 = extractPrefixAlias(">= 100", sorted);
		expect(match2?.key).toBe("greater_equal");
		expect(match2?.matchedAlias).toBe(">=");
		expect(match2?.remainderText).toBe("100");
	});

	test("extracts postfix aliases using cached compiled regexes", () => {
		const unitConfig = {
			mg: ["mg", "milligrams", "毫克"],
			g: ["g", "grams", "克"],
		};

		const sorted = flattenAndSortAliases(unitConfig, true);

		const match1 = extractPostfixAlias("50 milligrams", sorted);
		expect(match1?.key).toBe("mg");
		expect(match1?.remainderText).toBe("50");

		const matchCJK = extractPostfixAlias("100毫克", sorted);
		expect(matchCJK?.key).toBe("mg");
		expect(matchCJK?.remainderText).toBe("100");
	});

	test("splits by delimiters with cached regexes", () => {
		const delims = ["down to", "to", "until", "-"];

		const res1 = splitByDelimiters("50 mg down to 10 mg", delims);
		expect(res1?.parts).toEqual(["50 mg", "10 mg"]);
		expect(res1?.delimiter).toBe("down to");

		const res2 = splitByDelimiters("10-20-40", delims, {
			requireBoundaries: true,
		});
		expect(res2?.parts).toEqual(["10", "20", "40"]);
		expect(res2?.delimiter).toBe("-");
	});
});
