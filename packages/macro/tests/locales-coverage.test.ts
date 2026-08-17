import { describe, expect, test } from "bun:test";
import {
	type CompoundRateConfig,
	extractOperator,
	type OperatorConfig,
	parseCompoundRate,
	parseNumericValue,
	parseQuantity,
	QuantityConversionRegistry,
	type QuantityGrammarConfig,
	resolveOperator,
	type StatisticalConfig,
} from "../src";
import { multiplicativeTransform } from "../src/values/conversion/transforms";

// Initialize standard conversion registry for mass, volume, and time units
const registry = new QuantityConversionRegistry();
registry.registerUnit({
	id: "g",
	dimension: "mass",
	canonicalUnit: "g",
	composable: true,
	transform: multiplicativeTransform(1),
});
registry.registerUnit({
	id: "mg",
	dimension: "mass",
	canonicalUnit: "g",
	composable: true,
	transform: multiplicativeTransform(0.001),
});
registry.registerUnit({
	id: "kg",
	dimension: "mass",
	canonicalUnit: "g",
	composable: true,
	transform: multiplicativeTransform(1000),
});
registry.registerUnit({
	id: "mL",
	dimension: "volume",
	canonicalUnit: "mL",
	composable: true,
	transform: multiplicativeTransform(1),
});
registry.registerUnit({
	id: "L",
	dimension: "volume",
	canonicalUnit: "mL",
	composable: true,
	transform: multiplicativeTransform(1000),
});
registry.registerUnit({
	id: "hr",
	dimension: "time",
	canonicalUnit: "hr",
	composable: true,
	transform: multiplicativeTransform(1),
});
registry.registerUnit({
	id: "day",
	dimension: "time",
	canonicalUnit: "hr",
	composable: true,
	transform: multiplicativeTransform(24),
});

describe("Multi-Locale Comprehensive Coverage (Arabic, Russian, Chinese)", () => {
	// =========================================================================
	// 1. ARABIC (RTL, Eastern Arabic-Indic Digits, Comma Decimals)
	// =========================================================================
	describe("1. Arabic (ar) Language & Script Support", () => {
		const ARABIC_OPERATORS: OperatorConfig = {
			prefixAliases: {
				greater_equal: [">=", "أكبر من أو يساوي", "على الأقل"],
				less_equal: ["<=", "أقل من أو يساوي", "على الأكثر"],
				approximate: ["~", "حوالي", "تقريبا"],
			},
			negationPrefixes: ["ليس", "لا"],
			locales: "ar",
		};

		const ARABIC_STATS: StatisticalConfig = {
			qualifierAliases: {
				mean: ["متوسط", "معدل"],
				standard_deviation: ["الانحراف المعياري", "انحراف"],
			},
			locales: "ar",
		};

		const ARABIC_QUANTITY_CONFIG: QuantityGrammarConfig = {
			unitAliases: {
				mg: ["ملغ", "ملغم", "مليغرام"],
				g: ["غ", "غم", "غرام"],
				kg: ["كغ", "كغم", "كيلوغرام"],
				mL: ["مل", "مليلتر"],
				L: ["ل", "لتر"],
			},
			rangeDelimiters: ["إلى", "حتى", "-"],
			operatorConfig: ARABIC_OPERATORS,
			statisticalConfig: ARABIC_STATS,
			conversionRegistry: registry,
			locales: "ar",
		};

		const ARABIC_RATE_CONFIG: CompoundRateConfig = {
			quantityConfig: {
				...ARABIC_QUANTITY_CONFIG,
				unitAliases: {
					...ARABIC_QUANTITY_CONFIG.unitAliases,
					hr: ["ساعة", "ساعات"],
					day: ["يوم", "أيام"],
				},
			},
			operatorConfig: ARABIC_OPERATORS,
			rateDelimiters: ["/", "لكل", "في"],
			locales: "ar",
		};

		test("parses Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) and Arabic decimal separator", () => {
			const resInt = parseNumericValue("١٢٥", { locales: "ar" });
			expect(resInt.parsed?.value).toBe(125);

			const resDec = parseNumericValue("٣٫٧٥", {
				locales: "ar",
				decimalPoint: "٫",
			});
			expect(resDec.parsed?.value).toBe(3.75);
		});

		test("resolves Arabic operator phrases and compound negations", () => {
			const resGe = resolveOperator("أكبر من أو يساوي", ARABIC_OPERATORS);
			expect(resGe?.operator).toBe("greater_equal");

			// Negation inversion: "ليس أكبر من أو يساوي" -> inverted to less
			const resNeg = extractOperator(
				"ليس أكبر من أو يساوي ٥٠",
				ARABIC_OPERATORS,
			);
			expect(resNeg.operatorMatch?.operator).toBe("less");
			expect(resNeg.remainderText).toBe("٥٠");
		});

		test("parses Arabic quantities with Eastern Arabic numerals", () => {
			const res = parseQuantity("٥٠ ملغ", ARABIC_QUANTITY_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(50);
			expect(res.value?.primaryQuantity.unit).toBe("mg");
			expect(res.value?.primaryQuantity.canonicalMagnitude).toBe(0.05);
		});

		test("parses Arabic heterogeneous ranges (e.g. ٥٠ ملغ إلى ١ غ)", () => {
			const res = parseQuantity("٥٠ ملغ إلى ١ غ", ARABIC_QUANTITY_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.start.magnitude).toBe(50);
			expect(res.value?.range?.start.unit).toBe("mg");
			expect(res.value?.range?.end.magnitude).toBe(1);
			expect(res.value?.range?.end.unit).toBe("g");
			expect(res.value?.range?.isHeterogeneousUnits).toBe(true);
			expect(res.value?.range?.direction).toBe("ascending");
		});

		test("parses Arabic compound rates (e.g. ١٠ ملغ / كغ / يوم)", () => {
			const res = parseCompoundRate("١٠ ملغ / كغ / يوم", ARABIC_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			if (res.value?.numerator.type === "quantity") {
				expect(res.value.numerator.quantity.magnitude).toBe(10);
				expect(res.value.numerator.quantity.unit).toBe("mg");
			}
			expect(res.value?.denominators).toHaveLength(2);
			expect(res.value?.denominators[0]?.unit).toBe("kg");
			expect(res.value?.denominators[1]?.unit).toBe("day");
		});
	});

	// =========================================================================
	// 2. RUSSIAN (Cyrillic Script, Comma Decimals, Space Thousands Separators)
	// =========================================================================
	describe("2. Russian (ru) Language & Script Support", () => {
		const RUSSIAN_OPERATORS: OperatorConfig = {
			prefixAliases: {
				greater_equal: [">=", "не менее", "от"],
				less_equal: ["<=", "не более", "до"],
				approximate: ["~", "примерно", "около"],
			},
			negationPrefixes: ["не"],
			locales: "ru",
		};

		const RUSSIAN_STATS: StatisticalConfig = {
			qualifierAliases: {
				mean: ["в среднем", "среднее"],
				standard_deviation: ["СО", "стандартное отклонение"],
			},
			locales: "ru",
		};

		const RUSSIAN_QUANTITY_CONFIG: QuantityGrammarConfig = {
			unitAliases: {
				mg: ["мг", "миллиграмм", "миллиграмма", "миллиграммов"],
				g: ["г", "грамм", "грамма", "граммов"],
				kg: ["kg", "кг", "килограмм", "килограмма", "килограммов"],
				mL: ["мл", "миллилитр"],
				L: ["л", "литр"],
			},
			rangeDelimiters: ["до", "-", "по"],
			operatorConfig: RUSSIAN_OPERATORS,
			statisticalConfig: RUSSIAN_STATS,
			conversionRegistry: registry,
			decimalPoint: ",",
			thousandsSeparator: " ",
			locales: "ru",
		};

		const RUSSIAN_RATE_CONFIG: CompoundRateConfig = {
			quantityConfig: {
				...RUSSIAN_QUANTITY_CONFIG,
				unitAliases: {
					...RUSSIAN_QUANTITY_CONFIG.unitAliases,
					hr: ["ч", "час", "часа", "часов"],
					day: ["сут", "сутки", "дней", "день"],
				},
			},
			operatorConfig: RUSSIAN_OPERATORS,
			rateDelimiters: ["/", "в", "на"],
			locales: "ru",
		};

		test("parses Russian comma decimals and space thousands separators", () => {
			const res = parseNumericValue("1 500,75", {
				decimalPoint: ",",
				thousandsSeparator: " ",
				locales: "ru",
			});
			expect(res.parsed?.value).toBe(1500.75);
		});

		test("resolves Russian operator phrases and extracts operators", () => {
			const resOp = extractOperator("не менее 50 мг", RUSSIAN_OPERATORS);
			expect(resOp.operatorMatch?.operator).toBe("greater_equal");
			expect(resOp.remainderText).toBe("50 мг");
		});

		test("parses Russian quantities with Cyrillic units and comma decimals", () => {
			const res = parseQuantity("12,5 мг", RUSSIAN_QUANTITY_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(12.5);
			expect(res.value?.primaryQuantity.unit).toBe("mg");
		});

		test("parses Russian heterogeneous ranges (e.g. 50 мг до 1 г)", () => {
			const res = parseQuantity("50 мг до 1 г", RUSSIAN_QUANTITY_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.start.magnitude).toBe(50);
			expect(res.value?.range?.start.unit).toBe("mg");
			expect(res.value?.range?.end.magnitude).toBe(1);
			expect(res.value?.range?.end.unit).toBe("g");
			expect(res.value?.range?.isHeterogeneousUnits).toBe(true);
		});

		test("parses Russian compound rates (e.g. 10 мг/кг/сут)", () => {
			const res = parseCompoundRate("10 мг/кг/сут", RUSSIAN_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			if (res.value?.numerator.type === "quantity") {
				expect(res.value.numerator.quantity.magnitude).toBe(10);
				expect(res.value.numerator.quantity.unit).toBe("mg");
			}
			expect(res.value?.denominators).toHaveLength(2);
			expect(res.value?.denominators[0]?.unit).toBe("kg");
			expect(res.value?.denominators[1]?.unit).toBe("day");
		});
	});

	// =========================================================================
	// 3. CHINESE (CJK Ideographs, Full-Width Numerals, Non-Spaced Syntax)
	// =========================================================================
	describe("3. Chinese (zh) Language & Script Support", () => {
		const CHINESE_OPERATORS: OperatorConfig = {
			prefixAliases: {
				greater_equal: [">=", "至少", "不低于", "大於或等於"],
				less_equal: ["<=", "至多", "不超过", "小於或等於"],
				approximate: ["~", "大约", "約"],
			},
			negationPrefixes: ["不", "非"],
			locales: "zh-CN",
		};

		const CHINESE_STATS: StatisticalConfig = {
			qualifierAliases: {
				mean: ["平均", "平均值"],
				standard_deviation: ["标准差", "標準差"],
			},
			locales: "zh-CN",
		};

		const CHINESE_QUANTITY_CONFIG: QuantityGrammarConfig = {
			unitAliases: {
				mg: ["毫克", "mg"],
				g: ["克", "公克", "g"],
				kg: ["公斤", "千克", "kg"],
				mL: ["毫升", "ml"],
				L: ["升", "公升", "l"],
			},
			rangeDelimiters: ["到", "至", "～", "-"],
			operatorConfig: CHINESE_OPERATORS,
			statisticalConfig: CHINESE_STATS,
			conversionRegistry: registry,
			locales: "zh-CN",
		};

		const CHINESE_RATE_CONFIG: CompoundRateConfig = {
			quantityConfig: {
				...CHINESE_QUANTITY_CONFIG,
				unitAliases: {
					...CHINESE_QUANTITY_CONFIG.unitAliases,
					hr: ["小时", "小時", "hr"],
					day: ["天", "日", "day"],
				},
			},
			operatorConfig: CHINESE_OPERATORS,
			rateDelimiters: ["/", "每"],
			locales: "zh-CN",
		};

		test("parses Full-width Chinese/Japanese numerals (０１２３４５６７８９)", () => {
			const res = parseNumericValue("１２５０", { locales: "zh-CN" });
			expect(res.parsed?.value).toBe(1250);
		});

		test("extracts Chinese prefix operators without requiring whitespace (e.g. 至少50毫克)", () => {
			const res = extractOperator("至少50毫克", CHINESE_OPERATORS);
			expect(res.operatorMatch?.operator).toBe("greater_equal");
			expect(res.remainderText).toBe("50毫克");
		});

		test("parses non-spaced Chinese quantities (e.g. 50毫克, １００克)", () => {
			const res = parseQuantity("50毫克", CHINESE_QUANTITY_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(50);
			expect(res.value?.primaryQuantity.unit).toBe("mg");

			const resFullwidth = parseQuantity("１００克", CHINESE_QUANTITY_CONFIG);
			expect(resFullwidth.diagnostics).toHaveLength(0);
			expect(resFullwidth.value?.primaryQuantity.magnitude).toBe(100);
			expect(resFullwidth.value?.primaryQuantity.unit).toBe("g");
		});

		test("parses Chinese heterogeneous ranges with ideographic delimiters (e.g. 50毫克 到 1克)", () => {
			const res = parseQuantity("50毫克 到 1克", CHINESE_QUANTITY_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.start.magnitude).toBe(50);
			expect(res.value?.range?.start.unit).toBe("mg");
			expect(res.value?.range?.end.magnitude).toBe(1);
			expect(res.value?.range?.end.unit).toBe("g");
			expect(res.value?.range?.isHeterogeneousUnits).toBe(true);
		});

		test("parses Chinese compound rates (e.g. 10毫克/公斤/天)", () => {
			const res = parseCompoundRate("10毫克/公斤/天", CHINESE_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			if (res.value?.numerator.type === "quantity") {
				expect(res.value.numerator.quantity.magnitude).toBe(10);
				expect(res.value.numerator.quantity.unit).toBe("mg");
			}
			expect(res.value?.denominators).toHaveLength(2);
			expect(res.value?.denominators[0]?.unit).toBe("kg");
			expect(res.value?.denominators[1]?.unit).toBe("day");
		});
	});
});
