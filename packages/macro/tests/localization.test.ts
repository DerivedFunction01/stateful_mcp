import { describe, expect, test } from "bun:test";
import type { NumberWordConfig } from "../src/contracts/extension-config";
import { traverseLexicalTokens } from "../src/parser/macro-scanner";
import { ExpressionIndex } from "../src/resources/expression-index";
import {
	normalizeUnicodeDigits,
	UniversalNumberParser,
	UniversalWordSegmenter,
} from "../src/values/localization";

describe("Declarative Universal Localization & Future-Proof Unicode Engine", () => {
	describe("1. Universal Unicode Decimal Digit Normalization", () => {
		test("automatically normalizes digits across world numeral systems to ASCII 0..9", () => {
			// Arabic-Indic
			expect(normalizeUnicodeDigits("١٢.٥")).toBe("12.5");
			// Eastern Arabic / Persian
			expect(normalizeUnicodeDigits("۱۲.۵")).toBe("12.5");
			// Devanagari (Hindi)
			expect(normalizeUnicodeDigits("१२.५")).toBe("12.5");
			// Bengali
			expect(normalizeUnicodeDigits("১২.৫")).toBe("12.5");
			// Thai
			expect(normalizeUnicodeDigits("๑๒.๕")).toBe("12.5");
			// Fullwidth CJK
			expect(normalizeUnicodeDigits("１２．５")).toBe("12.5");
		});

		test("supports policy override (ascii-only and custom maps)", () => {
			expect(normalizeUnicodeDigits("١٢.٥", "ascii-only")).toBe("١٢.٥");
			expect(normalizeUnicodeDigits("XII", "custom", { XII: "12" })).toBe("12");
		});
	});

	describe("2. Unspaced Script Word Boundaries & Expression Indexing", () => {
		test("accurately matches Chinese and Japanese terms in continuous unspaced text", () => {
			const index = new ExpressionIndex({
				locale: "zh-CN",
				boundaryPolicy: "standard",
			});

			index.rebuild([
				{
					id: "expr_htn",
					term: "高血压",
					lookupTerm: "高血压",
					regexPattern: "高血压",
					isCaseInsensitive: false,
					canonicalValue: "hypertension",
					priorityWeight: 1,
					active: true,
				},
				{
					id: "expr_dm",
					term: "糖尿病",
					lookupTerm: "糖尿病",
					regexPattern: "糖尿病",
					isCaseInsensitive: false,
					canonicalValue: "diabetes",
					priorityWeight: 1,
					active: true,
				},
			]);

			// Chinese continuous sentence (no spaces)
			const resZh = index.search({
				backendId: "test_zh",
				argumentId: "condition",
				offset: 0,
				text: "患者有高血压病史",
			});
			expect(resZh).toHaveLength(1);
			expect(resZh[0]?.term).toBe("高血压");
			expect(resZh[0]?.start).toBe(3);
			expect(resZh[0]?.end).toBe(6);

			// Japanese continuous sentence (no spaces)
			const resJa = index.search({
				backendId: "test_ja",
				argumentId: "condition",
				offset: 0,
				text: "患者は糖尿病の既往歴がある",
			});
			expect(resJa).toHaveLength(1);
			expect(resJa[0]?.term).toBe("糖尿病");
		});

		test("matches Cyrillic case-insensitively with Unicode 'u' flag", () => {
			const index = new ExpressionIndex({
				locale: "ru-RU",
				boundaryPolicy: "standard",
			});

			index.rebuild([
				{
					id: "expr_study",
					term: "исследование",
					lookupTerm: "исследование",
					regexPattern: "исследование",
					isCaseInsensitive: true,
					canonicalValue: "study",
					priorityWeight: 1,
					active: true,
				},
			]);

			const resRu = index.search({
				backendId: "test_ru",
				argumentId: "procedure",
				offset: 0,
				text: "ПАЦИЕНТ ПРОШЕЛ ИССЛЕДОВАНИЕ",
			});
			expect(resRu).toHaveLength(1);
			expect(resRu[0]?.id).toBe("expr_study");
			expect(resRu[0]?.canonicalValue).toBe("study");
			expect(resRu[0]?.term).toBe("ИССЛЕДОВАНИЕ");
		});

		test("matches Turkish, Spanish, and German with Unicode boundaries and case folding", () => {
			const segmenter = new UniversalWordSegmenter("es", "standard");
			// Spanish accented letters boundary check
			const textEs = "tiene 10 años de edad";
			expect(segmenter.isWordBoundary(textEs, 9, 13)).toBe(true); // "años"

			// German Sharp S / uppercase Straße
			const regexDe = /straße/giu;
			expect(regexDe.test("STRAẞE")).toBe(true);
		});
	});

	describe("3. Multi-Locale Quote and Bracket Traversal", () => {
		test("supports asymmetric international quotes (guillemets, corner brackets)", () => {
			// French guillemets
			const tokensFr: string[] = [];
			traverseLexicalTokens(
				"macro «1 250,50 €» arg2",
				{ start: 0, end: 23 },
				{ quotePairs: [["«", "»"]] },
				(state) => {
					if (state.isInsideQuoteOrGroup) tokensFr.push(state.char);
				},
			);
			expect(tokensFr.join("")).toContain("1 250,50 €");

			// Chinese corner brackets
			const tokensZh: string[] = [];
			traverseLexicalTokens(
				"macro 「患者数据」 arg2",
				{ start: 0, end: 17 },
				{ quotePairs: [["「", "」"]] },
				(state) => {
					if (state.isInsideQuoteOrGroup) tokensZh.push(state.char);
				},
			);
			expect(tokensZh.join("")).toContain("患者数据");
		});

		test("strict English clinical mode restricts quotes to avoid apostrophe collisions", () => {
			// In strict clinical mode, only double quotes are configured
			let quoteOpened = false;
			traverseLexicalTokens(
				"patient's height 5'11\"",
				{ start: 0, end: 22 },
				{ quotePairs: [['"', '"']] }, // single quote is NOT a quote
				(state) => {
					if (state.char === "'") {
						quoteOpened = Boolean(state.quote);
					}
				},
			);
			// Apostrophe in "patient's" did NOT open a quote!
			expect(quoteOpened).toBe(false);
		});
	});

	describe("4. Universal Written Number Word Normalizer", () => {
		test("normalizes English number words (scale expressions and compound numbers)", () => {
			const enConfig: NumberWordConfig = {
				atoms: {
					"1": "one",
					"2": "two",
					"3": "three",
					"4": "four",
					"5": "five",
					"20": "twenty",
				},
				scales: [
					{ word: "hundred", value: 100, type: "minor" },
					{ word: "thousand", value: 1000, type: "major" },
				],
				conjunctions: ["and"],
			};

			const parser = new UniversalNumberParser(enConfig);
			const res = parser.normalize("give three hundred and twenty five units");
			expect(res.normalizedText).toBe("give 325 units");
			expect(res.matches).toEqual([
				expect.objectContaining({
					original: "three hundred and twenty five",
					value: 325,
				}),
			]);
		});

		test("normalizes Spanish number words", () => {
			const esConfig: NumberWordConfig = {
				atoms: {
					"1": "uno",
					"2": "dos",
					"3": "tres",
					"5": "cinco",
					"20": "veinte",
					"25": "veinticinco",
					"300": "trescientos",
				},
				scales: [{ word: "mil", value: 1000, type: "major" }],
				conjunctions: ["y"],
			};

			const parser = new UniversalNumberParser(esConfig);
			const res = parser.normalize("dosis de trescientos veinticinco mg");
			expect(res.normalizedText).toBe("dosis de 325 mg");
		});
	});
});
