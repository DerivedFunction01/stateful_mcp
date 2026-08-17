import { describe, expect, test } from "bun:test";
import {
	compileFormatTemplate,
	parseTemplateString,
	parseWithTemplate,
	type TemplateTokenSpec,
} from "../src/values/template-compiler";

describe("Universal Generic Format Template Compiler & Parser (template-compiler.ts)", () => {
	describe("1. Literal Affixes & Separators Extraction", () => {
		test("parses format template with affixes (e.g. XXYYYZZ with token YY)", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YY: { pattern: "\\d{2}", field: "year" },
			};

			const compiled = compileFormatTemplate("XXYYYZZ", tokens);
			expect(compiled.tokenOrder).toEqual(["year"]);

			const resValid = parseTemplateString("XX26YZZ", compiled);
			expect(resValid.matched).toBe(true);
			expect(resValid.fields.year).toBe("26");
			expect(resValid.rawMatches.year).toBe("26");

			const resInvalid = parseTemplateString("AB26YZZ", compiled);
			expect(resInvalid.matched).toBe(false);
		});

		test("parses friendly natural prose templates with literal words and punctuation", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "\\d{4}", field: "year", transform: Number },
				MM: {
					pattern: "(?:0?[1-9]|1[0-2])",
					field: "month",
					transform: Number,
				},
				DD: {
					pattern: "(?:0?[1-9]|[12]\\d|3[01])",
					field: "day",
					transform: Number,
				},
			};

			const template = "Year: YYYY, Month: MM, Day: DD";
			const res = parseWithTemplate(
				"Year: 2026, Month: 08, Day: 17",
				template,
				tokens,
			);
			expect(res.matched).toBe(true);
			expect(res.fields.year).toBe(2026);
			expect(res.fields.month).toBe(8);
			expect(res.fields.day).toBe(17);
		});

		test("parses international CJK templates with ideographic separators", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "[\\d\\p{Nd}]{4}", field: "year" },
				MM: { pattern: "[\\d\\p{Nd}]{1,2}", field: "month" },
				DD: { pattern: "[\\d\\p{Nd}]{1,2}", field: "day" },
			};

			const template = "YYYY年MM月DD日";
			const res = parseWithTemplate("2026年08月17日", template, tokens);
			expect(res.matched).toBe(true);
			expect(res.fields.year).toBe("2026");
			expect(res.fields.month).toBe("08");
			expect(res.fields.day).toBe("17");
		});

		test("parses compact unseparated formats", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "\\d{4}", field: "year" },
				MM: { pattern: "\\d{2}", field: "month" },
				DD: { pattern: "\\d{2}", field: "day" },
			};

			const res = parseWithTemplate("20260817", "YYYYMMDD", tokens);
			expect(res.matched).toBe(true);
			expect(res.fields.year).toBe("2026");
			expect(res.fields.month).toBe("08");
			expect(res.fields.day).toBe("17");
		});
	});

	describe("2. Longest Token Matching Precedence", () => {
		test("prioritizes longer token symbols (YYYY over YY, MM_name over MM)", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "\\d{4}", field: "fullYear" },
				YY: { pattern: "\\d{2}", field: "shortYear" },
				MM_name: {
					pattern: "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
					field: "monthName",
				},
				MM: { pattern: "\\d{2}", field: "monthNumber" },
				DD: { pattern: "\\d{2}", field: "day" },
			};

			const compiled = compileFormatTemplate("YYYY-MM_name-DD", tokens);
			expect(compiled.tokenOrder).toEqual(["fullYear", "monthName", "day"]);

			const res = parseTemplateString("2026-Aug-17", compiled);
			expect(res.matched).toBe(true);
			expect(res.fields.fullYear).toBe("2026");
			expect(res.fields.monthName).toBe("Aug");
			expect(res.fields.day).toBe("17");
		});
	});

	describe("3. Embedded Raw Regex Tokens (<regex:...>)", () => {
		test("matches flexible delimiters with embedded regex tokens when allowRegexTokens=true", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "\\d{4}", field: "year" },
				MM: { pattern: "\\d{2}", field: "month" },
				DD: { pattern: "\\d{2}", field: "day" },
			};

			const template =
				"YYYY<regex:(?:[\\/\\-\\.]|\\s+)>MM<regex:(?:[\\/\\-\\.]|\\s+)>DD";
			const options = { allowRegexTokens: true };

			const resDash = parseWithTemplate(
				"2026-08-17",
				template,
				tokens,
				options,
			);
			expect(resDash.matched).toBe(true);
			expect(resDash.fields.year).toBe("2026");

			const resSlash = parseWithTemplate(
				"2026/08/17",
				template,
				tokens,
				options,
			);
			expect(resSlash.matched).toBe(true);

			const resDot = parseWithTemplate("2026.08.17", template, tokens, options);
			expect(resDot.matched).toBe(true);

			const resSpace = parseWithTemplate(
				"2026 08 17",
				template,
				tokens,
				options,
			);
			expect(resSpace.matched).toBe(true);
		});

		test("treats <regex:...> as literal text when allowRegexTokens=false", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				TAG: { pattern: "\\w+", field: "tag" },
			};

			const template = "<regex:foo>TAG";
			// Default allowRegexTokens: false
			const resLiteral = parseWithTemplate(
				"<regex:foo>alpha",
				template,
				tokens,
			);
			expect(resLiteral.matched).toBe(true);
			expect(resLiteral.fields.tag).toBe("alpha");

			const resMismatch = parseWithTemplate("fooalpha", template, tokens);
			expect(resMismatch.matched).toBe(false);
		});

		test("emits diagnostic on malformed embedded regex and recovers gracefully", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "\\d{4}", field: "year" },
			};

			// Malformed regex with unclosed parenthesis: (?:foo
			const template = "YYYY<regex:(?:foo>end";
			const compiled = compileFormatTemplate(template, tokens, {
				allowRegexTokens: true,
			});

			expect(compiled.diagnostics.length).toBeGreaterThan(0);
			expect(compiled.diagnostics[0]?.code).toBe("invalid_template_regex");
		});
	});

	describe("4. Multi-Domain Reusability", () => {
		test("parses quantity templates (VALUE UNIT)", () => {
			const qtyTokens: Record<string, TemplateTokenSpec> = {
				VALUE: {
					pattern: "[\\d\\p{Nd}]+(?:\\.[\\d\\p{Nd}]+)?",
					field: "magnitude",
					transform: Number,
				},
				UNIT: { pattern: "[\\p{L}\\p{M}]+", field: "unit" },
			};

			const template = "VALUE<regex:\\s*>UNIT";
			const options = { allowRegexTokens: true };

			const res1 = parseWithTemplate("50mg", template, qtyTokens, options);
			expect(res1.matched).toBe(true);
			expect(res1.fields.magnitude).toBe(50);
			expect(res1.fields.unit).toBe("mg");

			const res2 = parseWithTemplate("100.5 mg", template, qtyTokens, options);
			expect(res2.matched).toBe(true);
			expect(res2.fields.magnitude).toBe(100.5);
			expect(res2.fields.unit).toBe("mg");

			const resCJK = parseWithTemplate("50毫克", template, qtyTokens, options);
			expect(resCJK.matched).toBe(true);
			expect(resCJK.fields.magnitude).toBe(50);
			expect(resCJK.fields.unit).toBe("毫克");
		});

		test("parses compound rate templates (AMOUNT/DIVISOR)", () => {
			const rateTokens: Record<string, TemplateTokenSpec> = {
				AMOUNT: { pattern: "\\$\\d+", field: "amount" },
				DIVISOR: { pattern: "\\w+", field: "divisor" },
			};

			const template = "AMOUNT<regex:\\s*(?:\\/|per)\\s*>DIVISOR";
			const options = { allowRegexTokens: true };

			const resSlash = parseWithTemplate(
				"$50/hr",
				template,
				rateTokens,
				options,
			);
			expect(resSlash.matched).toBe(true);
			expect(resSlash.fields.amount).toBe("$50");
			expect(resSlash.fields.divisor).toBe("hr");

			const resPer = parseWithTemplate(
				"$50 per hr",
				template,
				rateTokens,
				options,
			);
			expect(resPer.matched).toBe(true);
			expect(resPer.fields.amount).toBe("$50");
			expect(resPer.fields.divisor).toBe("hr");
		});

		test("safely escapes regex characters in literal separator strings", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				VAL: { pattern: "\\d+", field: "value" },
				UNIT: { pattern: "[a-zA-Z]+", field: "unit" },
			};

			// Format containing regex special characters: [ ] ( ) + * ?
			const template = "[VAL] + (UNIT)*";
			const res = parseWithTemplate("[50] + (mg)*", template, tokens);
			expect(res.matched).toBe(true);
			expect(res.fields.value).toBe("50");
			expect(res.fields.unit).toBe("mg");
		});
	});

	describe("5. Memoization & Cache Invariants", () => {
		test("returns cached CompiledTemplate instance on repeated compile calls", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				YYYY: { pattern: "\\d{4}", field: "year" },
				MM: { pattern: "\\d{2}", field: "month" },
			};

			const first = compileFormatTemplate("YYYY-MM", tokens);
			const second = compileFormatTemplate("YYYY-MM", tokens);

			expect(first).toBe(second);
		});
	});

	describe("6. Ordinals vs Non-Ordinals in a Singular Format String", () => {
		test("matches both ordinal and non-ordinal dates via embedded regex tag (MMMM D<regex:...> YYYY)", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				MMMM: {
					pattern:
						"(?:January|February|March|April|May|June|July|August|September|October|November|December)",
					field: "month",
				},
				D: {
					pattern: "(?:0?[1-9]|[12]\\d|3[01])",
					field: "day",
					transform: Number,
				},
				YYYY: { pattern: "\\d{4}", field: "year", transform: Number },
			};

			// Singular template supporting both "August 17th, 2026" and "August 17, 2026"
			const template = "MMMM D<regex:(?:st|nd|rd|th)?>, YYYY";
			const options = { allowRegexTokens: true };

			// 1. Ordinal suffix: 17th
			const resOrdinal17 = parseWithTemplate(
				"August 17th, 2026",
				template,
				tokens,
				options,
			);
			expect(resOrdinal17.matched).toBe(true);
			expect(resOrdinal17.fields.month).toBe("August");
			expect(resOrdinal17.fields.day).toBe(17);
			expect(resOrdinal17.fields.year).toBe(2026);

			// 2. Non-ordinal: 17
			const resPlain17 = parseWithTemplate(
				"August 17, 2026",
				template,
				tokens,
				options,
			);
			expect(resPlain17.matched).toBe(true);
			expect(resPlain17.fields.month).toBe("August");
			expect(resPlain17.fields.day).toBe(17);
			expect(resPlain17.fields.year).toBe(2026);

			// 3. Other ordinals: 1st, 2nd, 3rd
			const res1st = parseWithTemplate(
				"August 1st, 2026",
				template,
				tokens,
				options,
			);
			expect(res1st.matched).toBe(true);
			expect(res1st.fields.day).toBe(1);

			const res2nd = parseWithTemplate(
				"August 2nd, 2026",
				template,
				tokens,
				options,
			);
			expect(res2nd.matched).toBe(true);
			expect(res2nd.fields.day).toBe(2);

			const res3rd = parseWithTemplate(
				"August 3rd, 2026",
				template,
				tokens,
				options,
			);
			expect(res3rd.matched).toBe(true);
			expect(res3rd.fields.day).toBe(3);
		});

		test("matches ordinal and non-ordinal dates via token definition (Do token in MMMM Do, YYYY)", () => {
			const tokens: Record<string, TemplateTokenSpec> = {
				MMMM: {
					pattern: "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
					field: "month",
				},
				Do: {
					pattern: "(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?",
					field: "day",
					transform: (val) => parseInt(val, 10),
				},
				YYYY: { pattern: "\\d{4}", field: "year", transform: Number },
			};

			const template = "MMMM Do, YYYY";

			// Ordinal matching
			const resOrdinal = parseWithTemplate("Aug 17th, 2026", template, tokens);
			expect(resOrdinal.matched).toBe(true);
			expect(resOrdinal.fields.month).toBe("Aug");
			expect(resOrdinal.fields.day).toBe(17);
			expect(resOrdinal.fields.year).toBe(2026);

			// Non-ordinal matching with exact same template
			const resPlain = parseWithTemplate("Aug 17, 2026", template, tokens);
			expect(resPlain.matched).toBe(true);
			expect(resPlain.fields.month).toBe("Aug");
			expect(resPlain.fields.day).toBe(17);
			expect(resPlain.fields.year).toBe(2026);
		});

		test("supports multi-lingual ordinals (French 1er vs 2, German 17. vs 17)", () => {
			// French template: "le Do MMMM YYYY"
			const frenchTokens: Record<string, TemplateTokenSpec> = {
				MMMM: { pattern: "(?:mai|juin|juillet|août)", field: "month" },
				Do: {
					pattern: "\\d{1,2}(?:er)?",
					field: "day",
					transform: (v) => parseInt(v, 10),
				},
				YYYY: { pattern: "\\d{4}", field: "year", transform: Number },
			};

			const frTemplate = "le Do MMMM YYYY";
			const resFrOrdinal = parseWithTemplate(
				"le 1er mai 2026",
				frTemplate,
				frenchTokens,
			);
			expect(resFrOrdinal.matched).toBe(true);
			expect(resFrOrdinal.fields.day).toBe(1);

			const resFrPlain = parseWithTemplate(
				"le 2 mai 2026",
				frTemplate,
				frenchTokens,
			);
			expect(resFrPlain.matched).toBe(true);
			expect(resFrPlain.fields.day).toBe(2);

			// German template: "Do MMMM YYYY" (with optional ordinal dot)
			const germanTokens: Record<string, TemplateTokenSpec> = {
				MMMM: { pattern: "(?:August|Mai|Juni)", field: "month" },
				Do: {
					pattern: "\\d{1,2}\\.?",
					field: "day",
					transform: (v) => parseInt(v, 10),
				},
				YYYY: { pattern: "\\d{4}", field: "year", transform: Number },
			};

			const deTemplate = "Do MMMM YYYY";
			const resDeDot = parseWithTemplate(
				"17. August 2026",
				deTemplate,
				germanTokens,
			);
			expect(resDeDot.matched).toBe(true);
			expect(resDeDot.fields.day).toBe(17);

			const resDeNoDot = parseWithTemplate(
				"17 August 2026",
				deTemplate,
				germanTokens,
			);
			expect(resDeNoDot.matched).toBe(true);
			expect(resDeNoDot.fields.day).toBe(17);
		});
	});
});
