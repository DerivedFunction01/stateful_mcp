import { describe, expect, test } from "bun:test";
import {
	extractOperator,
	formatOperator,
	OPERATOR_KINDS,
	type OperatorConfig,
	resolveOperator,
} from "../src/values/operators";

// Test dictionaries used strictly for unit testing
const TEST_OPERATOR_CONFIG: OperatorConfig = {
	prefixAliases: {
		not_equal: [
			"!=",
			"≠",
			"<>",
			"not equal to",
			"not equal",
			"other than",
			"different from",
			"diferente de",
			"nicht gleich",
			"不等于",
			"不等於",
			"異なる",
			"لا يساوي",
		],
		greater_equal: [
			">=",
			"≥",
			"=>",
			"at least",
			"no less than",
			"not less than",
			"not below",
			"not under",
			"al menos",
			"nicht weniger als",
			"mindestens",
			"至少",
			"不低于",
			"以上",
			"على الأقل",
		],
		less_equal: [
			"<=",
			"≤",
			"=<",
			"at most",
			"up to",
			"no more than",
			"not more than",
			"not greater than",
			"not above",
			"not exceeding",
			"not over",
			"como máximo",
			"no más de",
			"nicht mehr als",
			"höchstens",
			"至多",
			"以下",
			"不超过",
			"على الأكثر",
		],
		greater: [
			">",
			"more than",
			"greater than",
			"above",
			"over",
			"más de",
			"über",
			"超過",
			"أكثر من",
		],
		less: [
			"<",
			"less than",
			"below",
			"under",
			"menos de",
			"unter",
			"未満",
			"أقل من",
		],
		approximate: [
			"~",
			"≈",
			"≃",
			"approx",
			"approximately",
			"about",
			"around",
			"ca.",
			"cerca de",
			"etwa",
			"約",
			"大约",
			"حوالي",
		],
		tolerance: [
			"±",
			"+/-",
			"+-",
			"plus or minus",
			"mas o menos",
			"plus/minus",
			"正負",
		],
		equal: [
			"==",
			"=",
			"equal to",
			"equals",
			"igual a",
			"gleich",
			"等于",
			"يساوي",
		],
	},
	postfixAliases: {
		approximate: [
			"approx",
			"approximately",
			"about",
			"or so",
			"around",
			"左右",
			"約",
			"大约",
			"تقريباً",
		],
		greater_equal: [
			"or more",
			"and up",
			"and above",
			"at least",
			"plus",
			"以上",
			"على الأقل",
		],
		less_equal: [
			"or less",
			"and down",
			"and below",
			"at most",
			"以下",
			"على الأكثر",
		],
		greater: ["plus", "and above", "over", "超過"],
		less: ["and below", "under", "未満"],
		tolerance: ["±", "+/-", "+-", "plus or minus", "正負"],
		equal: ["exact", "exactly", "precisely", "exacto", "genau", "精准"],
		not_equal: [
			"!=",
			"≠",
			"not equal",
			"other than",
			"different",
			"diferente",
			"nicht gleich",
			"不等于",
		],
	},
};

describe("Universal Operator Engine (operators.ts)", () => {
	test("defines all canonical OPERATOR_KINDS accurately", () => {
		expect(OPERATOR_KINDS).toEqual([
			"equal",
			"not_equal",
			"greater_equal",
			"less_equal",
			"greater",
			"less",
			"approximate",
			"tolerance",
		]);
	});

	describe("1. Zero Hardcoded Fallbacks (Unconfigured Behavior)", () => {
		test("returns undefined / untouched remainder when unconfigured", () => {
			expect(resolveOperator(">=", "prefix", {})).toBeUndefined();
			expect(resolveOperator("approx", "postfix", {})).toBeUndefined();

			const res = extractOperator(">= 50 mg", {});
			expect(res.operatorMatch).toBeUndefined();
			expect(res.remainderText).toBe(">= 50 mg");
		});
	});

	describe("2. resolveOperator (Explicit User Config Resolution)", () => {
		test("resolves prefix symbols and multi-lingual words", () => {
			expect(
				resolveOperator("!=", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("not_equal");
			expect(
				resolveOperator("≠", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("not_equal");
			expect(
				resolveOperator("<>", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("not_equal");
			expect(
				resolveOperator("not equal to", "prefix", TEST_OPERATOR_CONFIG)
					?.operator,
			).toBe("not_equal");
			expect(
				resolveOperator("nicht gleich", "prefix", TEST_OPERATOR_CONFIG)
					?.operator,
			).toBe("not_equal");
			expect(
				resolveOperator("不等于", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("not_equal");
			expect(
				resolveOperator("لا يساوي", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("not_equal");

			expect(
				resolveOperator(">=", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("≥", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("at least", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("al menos", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("mindestens", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("至少", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");

			expect(
				resolveOperator("not greater than", "prefix", TEST_OPERATOR_CONFIG)
					?.operator,
			).toBe("less_equal");
			expect(
				resolveOperator("no more than", "prefix", TEST_OPERATOR_CONFIG)
					?.operator,
			).toBe("less_equal");
			expect(
				resolveOperator("not less than", "prefix", TEST_OPERATOR_CONFIG)
					?.operator,
			).toBe("greater_equal");

			expect(
				resolveOperator("~", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("approx", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("cerca de", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("etwa", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("約", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("حوالي", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");

			expect(
				resolveOperator("±", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("tolerance");
			expect(
				resolveOperator("+/-", "prefix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("tolerance");
			expect(
				resolveOperator("plus or minus", "prefix", TEST_OPERATOR_CONFIG)
					?.operator,
			).toBe("tolerance");
		});

		test("resolves postfix words and CJK/Arabic qualifiers", () => {
			expect(
				resolveOperator("approx", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("左右", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");
			expect(
				resolveOperator("تقريباً", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("approximate");

			expect(
				resolveOperator("or more", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("and up", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");
			expect(
				resolveOperator("以上", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("greater_equal");

			expect(
				resolveOperator("or less", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("less_equal");
			expect(
				resolveOperator("以下", "postfix", TEST_OPERATOR_CONFIG)?.operator,
			).toBe("less_equal");
		});
	});

	describe("3. extractOperator (Prefix & Postfix Extraction)", () => {
		test("extracts prefix operators and compound negations", () => {
			const res1 = extractOperator(">= 50 mg", TEST_OPERATOR_CONFIG);
			expect(res1.operatorMatch?.operator).toBe("greater_equal");
			expect(res1.operatorMatch?.position).toBe("prefix");
			expect(res1.remainderText).toBe("50 mg");

			const res2 = extractOperator(
				"not greater than 50 mg",
				TEST_OPERATOR_CONFIG,
			);
			expect(res2.operatorMatch?.operator).toBe("less_equal");
			expect(res2.operatorMatch?.position).toBe("prefix");
			expect(res2.remainderText).toBe("50 mg");

			const res3 = extractOperator("at least 100 cups", TEST_OPERATOR_CONFIG);
			expect(res3.operatorMatch?.operator).toBe("greater_equal");
			expect(res3.operatorMatch?.position).toBe("prefix");
			expect(res3.remainderText).toBe("100 cups");

			const res4 = extractOperator("~ 10-20 mg", TEST_OPERATOR_CONFIG);
			expect(res4.operatorMatch?.operator).toBe("approximate");
			expect(res4.operatorMatch?.position).toBe("prefix");
			expect(res4.remainderText).toBe("10-20 mg");
		});

		test("extracts postfix operators and leaves clean remainder", () => {
			const res1 = extractOperator("50 mg approx", TEST_OPERATOR_CONFIG);
			expect(res1.operatorMatch?.operator).toBe("approximate");
			expect(res1.operatorMatch?.position).toBe("postfix");
			expect(res1.remainderText).toBe("50 mg");

			const res2 = extractOperator("100 mL or more", TEST_OPERATOR_CONFIG);
			expect(res2.operatorMatch?.operator).toBe("greater_equal");
			expect(res2.operatorMatch?.position).toBe("postfix");
			expect(res2.remainderText).toBe("100 mL");

			const res3 = extractOperator("50 mg 左右", TEST_OPERATOR_CONFIG);
			expect(res3.operatorMatch?.operator).toBe("approximate");
			expect(res3.operatorMatch?.position).toBe("postfix");
			expect(res3.remainderText).toBe("50 mg");

			const res4 = extractOperator("10-20 mg or less", TEST_OPERATOR_CONFIG);
			expect(res4.operatorMatch?.operator).toBe("less_equal");
			expect(res4.operatorMatch?.position).toBe("postfix");
			expect(res4.remainderText).toBe("10-20 mg");
		});
	});

	describe("4. formatOperator (Symmetric Formatting)", () => {
		test("formats canonical operator as universal math symbol when unconfigured", () => {
			expect(formatOperator("greater_equal", "prefix", {})).toBe(">=");
			expect(formatOperator("less_equal", "prefix", {})).toBe("<=");
			expect(formatOperator("not_equal", "prefix", {})).toBe("!=");
			expect(formatOperator("approximate", "prefix", {})).toBe("~");
			expect(formatOperator("tolerance", "prefix", {})).toBe("±");
			expect(formatOperator("equal", "prefix", {})).toBe("=");
		});

		test("formats canonical operator using user-configured aliases when provided", () => {
			const localizedConfig: OperatorConfig = {
				prefixAliases: {
					greater_equal: ["al menos", ">="],
					not_equal: ["diferente de", "!="],
					approximate: ["cerca de", "~"],
				},
				postfixAliases: {
					greater_equal: ["以上", ">="],
					approximate: ["左右", "~"],
				},
			};

			expect(formatOperator("greater_equal", "prefix", localizedConfig)).toBe(
				"al menos",
			);
			expect(formatOperator("not_equal", "prefix", localizedConfig)).toBe(
				"diferente de",
			);
			expect(formatOperator("greater_equal", "postfix", localizedConfig)).toBe(
				"以上",
			);
			expect(formatOperator("approximate", "postfix", localizedConfig)).toBe(
				"左右",
			);
		});
	});

	describe("5. Adversarial Configuration (Zero Hardcoded Bias / Complete User Authority)", () => {
		test("strictly respects swapped aliases without heuristic interference", () => {
			// Purposely configure '>=' and 'at least' as 'less', and '<=' as 'greater'
			const swappedConfig: OperatorConfig = {
				prefixAliases: {
					less: [">=", "at least"],
					greater: ["<=", "at most"],
				},
			};

			const match1 = resolveOperator(">=", "prefix", swappedConfig);
			expect(match1?.operator).toBe("less");

			const match2 = resolveOperator("at least", "prefix", swappedConfig);
			expect(match2?.operator).toBe("less");

			const match3 = resolveOperator("<=", "prefix", swappedConfig);
			expect(match3?.operator).toBe("greater");

			const ext = extractOperator(">= 50 mg", swappedConfig);
			expect(ext.operatorMatch?.operator).toBe("less");
			expect(ext.remainderText).toBe("50 mg");

			expect(formatOperator("less", "prefix", swappedConfig)).toBe(">=");
		});

		test("inverts operators cleanly when user-defined negationPrefixes precede positive aliases", () => {
			const negationConfig: OperatorConfig = {
				prefixAliases: {
					greater: [">", "more than", "greater than", "above"],
					less: ["<", "less than"],
					equal: ["=", "equal to"],
				},
				negationPrefixes: ["not", "no", "nicht", "不"],
			};

			// "not > 50 mg" -> inverts 'greater' to 'less_equal'
			const res1 = extractOperator("not > 50 mg", negationConfig);
			expect(res1.operatorMatch?.operator).toBe("less_equal");
			expect(res1.operatorMatch?.isInverted).toBe(true);
			expect(res1.remainderText).toBe("50 mg");

			// "no more than 100 mL" -> inverts 'greater' to 'less_equal'
			const res2 = extractOperator("no more than 100 mL", negationConfig);
			expect(res2.operatorMatch?.operator).toBe("less_equal");
			expect(res2.operatorMatch?.isInverted).toBe(true);
			expect(res2.remainderText).toBe("100 mL");

			// "nicht < 20 kg" -> inverts 'less' to 'greater_equal'
			const res3 = extractOperator("nicht < 20 kg", negationConfig);
			expect(res3.operatorMatch?.operator).toBe("greater_equal");
			expect(res3.operatorMatch?.isInverted).toBe(true);
			expect(res3.remainderText).toBe("20 kg");

			// Direct resolveOperator token inversion
			const resToken = resolveOperator(
				"not greater than",
				"prefix",
				negationConfig,
			);
			expect(resToken?.operator).toBe("less_equal");
			expect(resToken?.isInverted).toBe(true);
		});

		test("inverts operators cleanly when user-defined negationPostfixes follow positive aliases", () => {
			const cjkConfig: OperatorConfig = {
				postfixAliases: {
					greater_equal: ["以上"],
					greater: ["超過"],
				},
				negationPostfixes: ["ではない", "ではないです"],
			};

			// "50 mg 以上 ではない" -> inverts 'greater_equal' to 'less'
			const res = extractOperator("50 mg 以上 ではない", cjkConfig);
			expect(res.operatorMatch?.operator).toBe("less");
			expect(res.operatorMatch?.isInverted).toBe(true);
			expect(res.remainderText).toBe("50 mg");

			// Direct resolveOperator token inversion
			const resToken = resolveOperator("以上 ではない", "postfix", cjkConfig);
			expect(resToken?.operator).toBe("less");
			expect(resToken?.isInverted).toBe(true);
		});
	});
});
