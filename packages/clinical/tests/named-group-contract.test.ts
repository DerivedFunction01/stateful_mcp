import { beforeEach, describe, expect, test } from "bun:test";
import { getCompiledRegex } from "../src/parser/_compiled-regex";
import { GenericTokenizer } from "../src/parser/generic-tokenizer";
import { ClinicalDateRangeTokenizer } from "../src/parser/helpers/clinical-date-range-helper";
import { FrequencyHelper } from "../src/parser/helpers/frequency-helper";
import { QuantityTokenizer } from "../src/parser/helpers/measurement-helper";
import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_CALENDAR_DATE_FORMATS,
	DEFAULT_EVALUATOR_RULES,
} from "../src/seed/defaults";
import type { AttributeParserRule } from "../src/store/interfaces";
import { buildCalendarDateRules } from "../src/store/rules-builder";

describe("Named Group Contract Enforcement", () => {
	const calendarRules = buildCalendarDateRules(DEFAULT_CALENDAR_DATE_FORMATS);

	const resetCalendarRegexState = () => {
		for (const rule of calendarRules) {
			for (const pattern of rule.regexPatterns) {
				getCompiledRegex(pattern, "gi").lastIndex = 0;
			}
		}
	};

	describe("calendar_date rules", () => {
		const rules = [...DEFAULT_ATTRIBUTE_RULES, ...calendarRules];

		beforeEach(() => {
			resetCalendarRegexState();
		});

		test("accepts valid MM/DD/YYYY match with exact contract groups", () => {
			const result = ClinicalDateRangeTokenizer.tokenize(
				"01/15/2023",
				rules,
				DEFAULT_EVALUATOR_RULES,
			);
			expect(result?.startCalendarDate).toBeDefined();
			expect(result?.startCalendarDate?.toISOString()).toBe(
				"2023-01-15T00:00:00.000Z",
			);
		});

		test("rejects match with unknown extra named groups", () => {
			const poisonedRules: AttributeParserRule[] = [
				{
					targetField: "calendar_date",
					targetValue: "calendar_date",
					regexPatterns: [
						"(?<mm>\\d{2})/(?<dd>\\d{2})/(?<yyyy>\\d{4})(?<extra>.*)",
					],
					isCaseInsensitive: true,
					namedGroupContract: {
						required: ["mm", "dd", "yyyy"],
						allowed: ["mm", "dd", "yyyy"],
					},
				},
			];
			const result = ClinicalDateRangeTokenizer.tokenize(
				"01/15/2023",
				poisonedRules,
				DEFAULT_EVALUATOR_RULES,
			);
			expect(result?.startCalendarDate).toBeUndefined();
		});

		test("rejects match missing required group yyyy", () => {
			const incompleteRules: AttributeParserRule[] = [
				{
					targetField: "calendar_date",
					targetValue: "calendar_date",
					regexPatterns: ["(?<mm>\\d{2})/(?<dd>\\d{2})/\\d{4}"],
					isCaseInsensitive: true,
					namedGroupContract: {
						required: ["mm", "dd", "yyyy"],
						allowed: ["mm", "dd", "yyyy"],
					},
				},
			];
			const result = ClinicalDateRangeTokenizer.tokenize(
				"01/15/2023",
				incompleteRules,
				DEFAULT_EVALUATOR_RULES,
			);
			expect(result?.startCalendarDate).toBeUndefined();
		});
	});

	describe("quantity / unit evaluator rules", () => {
		const rules = [...DEFAULT_ATTRIBUTE_RULES];

		test("QuantityTokenizer accepts valid magnitude + unit match", () => {
			const candidates = QuantityTokenizer.tokenize("50 mg", rules);
			const mg = candidates.find((c) => c.rawUnit === "mg");
			expect(mg).toBeDefined();
			expect(mg!.magnitude).toBe(50);
		});

		test("QuantityTokenizer rejects match with unknown extra group", () => {
			const customRules: AttributeParserRule[] = [
				{
					targetField: "unit",
					targetValue: "mg",
					regexPatterns: ["\\b(?<magnitude>\\d+)\\s*(?<unit>mg)\\b(?<junk>.*)"],
					isCaseInsensitive: true,
					unitAnchor: "mass",
					namedGroupContract: {
						required: ["magnitude", "unit"],
						allowed: ["magnitude", "unit"],
					},
				},
			];
			const candidates = QuantityTokenizer.tokenize("50 mg extra", customRules);
			const mg = candidates.find((c) => c.rawUnit === "mg");
			expect(mg).toBeUndefined();
		});

		test("QuantityTokenizer rejects match missing required unit group", () => {
			const customRules: AttributeParserRule[] = [
				{
					targetField: "unit",
					targetValue: "mg",
					regexPatterns: ["\\b(?<magnitude>\\d+)\\s*mg\\b"],
					isCaseInsensitive: true,
					unitAnchor: "mass",
					namedGroupContract: {
						required: ["magnitude", "unit"],
						allowed: ["magnitude", "unit"],
					},
				},
			];
			const candidates = QuantityTokenizer.tokenize("50 mg", customRules);
			expect(candidates.length).toBe(0);
		});
	});

	describe("observation severity ratio evaluator", () => {
		const ratioRule = DEFAULT_EVALUATOR_RULES.find(
			(r) => r.ruleId === "severity_ratio",
		);
		test("GenericTokenizer accepts valid numerator/denominator", () => {
			if (!ratioRule) return;
			const token = GenericTokenizer.tokenize(
				"7 out of 10",
				DEFAULT_ATTRIBUTE_RULES,
				[ratioRule],
			);
			expect(token.namedGroups.severityScore).toBeDefined();
			expect(token.namedGroups.severityScore?.numerator).toBe("7");
			expect(token.namedGroups.severityScore?.denominator).toBe("10");
		});

		test("GenericTokenizer rejects ratio with extra group", () => {
			if (!ratioRule) return;
			const poisonedRule = {
				...ratioRule,
				regexPatterns: ["(?<numerator>\\d+)/(?<denominator>\\d+)(?<junk>.*)"],
				namedGroupContract: {
					required: ["numerator", "denominator"],
					allowed: ["numerator", "denominator"],
				},
			};
			const token = GenericTokenizer.tokenize("7/10", DEFAULT_ATTRIBUTE_RULES, [
				poisonedRule,
			]);
			expect(token.namedGroups.severityScore).toBeUndefined();
		});
	});

	describe("vitals blood pressure evaluator", () => {
		const bpRule = DEFAULT_EVALUATOR_RULES.find((r) => r.ruleId === "bp");
		test("GenericTokenizer accepts valid systolic/diastolic/unit", () => {
			if (!bpRule) return;
			const token = GenericTokenizer.tokenize("120/80 mmHg", [], [bpRule]);
			expect(token.namedGroups.blood_pressure).toBeDefined();
			expect(token.namedGroups.blood_pressure?.systolic).toBe("120");
			expect(token.namedGroups.blood_pressure?.diastolic).toBe("80");
		});

		test("GenericTokenizer rejects blood pressure with extra named group", () => {
			if (!bpRule) return;
			const poisonedRule = {
				...bpRule,
				regexPatterns: [
					"(?<systolic>\\d{2,3})\\s*\\/\\s*(?<diastolic>\\d{2,3})\\s*(?<unit>[a-zA-Z%\\[\\]]+)?(?<junk>.*)",
				],
				namedGroupContract: {
					required: ["systolic", "diastolic"],
					allowed: ["systolic", "diastolic", "unit"],
				},
			};
			const token = GenericTokenizer.tokenize(
				"120/80 mmHg junk",
				[],
				[poisonedRule],
			);
			expect(token.namedGroups.blood_pressure).toBeUndefined();
		});
	});

	describe("medication quantity evaluator", () => {
		test("GenericTokenizer accepts valid quantity + unit", () => {
			const qtyRule = DEFAULT_EVALUATOR_RULES.find((r) => r.ruleId === "qty");
			if (!qtyRule) return;
			const token = GenericTokenizer.tokenize(
				"10 mg",
				DEFAULT_ATTRIBUTE_RULES,
				[qtyRule],
			);
			expect(token.namedGroups.quantity).toBeDefined();
			expect(token.namedGroups.quantity?.quantity).toBe("10");
			expect(token.namedGroups.quantity?.unit).toBe("mg");
		});

		test("GenericTokenizer rejects quantity with unknown extra group", () => {
			const qtyRule = DEFAULT_EVALUATOR_RULES.find((r) => r.ruleId === "qty");
			if (!qtyRule) return;
			const poisonedRule = {
				...qtyRule,
				regexPatterns: [
					"(?<quantity>\\d+(?:\\.\\d+)?)\\s*(?<unit>h|hr|hours?|d|days?|mg|g|ml)(?<junk>.*)",
				],
				namedGroupContract: {
					required: ["quantity", "unit"],
					allowed: ["quantity", "unit"],
				},
			};
			const token = GenericTokenizer.tokenize(
				"10 mg junk",
				DEFAULT_ATTRIBUTE_RULES,
				[poisonedRule],
			);
			expect(token.namedGroups.quantity).toBeUndefined();
		});
	});

	describe("frequency helper evaluator", () => {
		test("FrequencyHelper.parse accepts valid every X hours match", () => {
			const freqRule = DEFAULT_EVALUATOR_RULES.find(
				(r) => r.ruleId === "freq_every",
			);
			if (!freqRule) return;
			const result = FrequencyHelper.parse(
				"every 8 hours",
				DEFAULT_ATTRIBUTE_RULES,
				[freqRule],
			);
			expect(result?.interval).toEqual({ multiplier: 8, unit: "hour" });
			expect(result?.cadenceType).toBe("interval");
		});

		test("FrequencyHelper.parse rejects match with disallowed extra group", () => {
			const freqRule = DEFAULT_EVALUATOR_RULES.find(
				(r) => r.ruleId === "freq_every",
			);
			if (!freqRule) return;
			const poisonedRule = {
				...freqRule,
				regexPatterns: [
					"(?:every|cada)\\s+(?<multiplier>\\d+(?:\\.\\d+)?)\\s*(?<unit>\\S+)(?<junk>.*)",
				],
				namedGroupContract: {
					required: ["multiplier", "unit"],
					allowed: ["multiplier", "unit"],
				},
			};
			const result = FrequencyHelper.parse(
				"every 8 hours junk",
				DEFAULT_ATTRIBUTE_RULES,
				[poisonedRule],
			);
			expect(result?.interval).toBeUndefined();
			expect(result?.cadenceType).toBe("one_time");
		});
	});
});
