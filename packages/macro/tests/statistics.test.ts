import { describe, expect, test } from "bun:test";
import {
	extractStatisticalQualifier,
	parsePercentageValue,
	parseProportionalValue,
	parseRatioValue,
	resolveStatisticalQualifier,
	STATISTICAL_QUALIFIER_TYPES,
	type StatisticalConfig,
} from "../src/values/statistics";

const TEST_STATS_CONFIG: StatisticalConfig = {
	qualifierAliases: {
		mean: ["mean", "mean of", "average", "average of", "avg", "promedio"],
		median: ["median", "median of", "mediana"],
		mode: ["mode", "mode of"],
		standard_deviation: [
			"standard deviation",
			"standard deviation of",
			"std dev",
			"SD",
			"SD of",
			"desviación estándar",
		],
		standard_error: [
			"standard error",
			"standard error of",
			"std err",
			"SE",
			"SE of",
			"SEM",
		],
		variance: ["variance", "variance of", "varianza"],
		margin_of_error: [
			"margin of error",
			"margin of error of",
			"error of",
			"error",
			"margen de error",
		],
		confidence_interval: ["confidence interval", "CI", "IC"],
		interquartile_range: ["interquartile range", "IQR"],
	},
};

describe("Universal Statistical & Qualifier Engine (statistics.ts)", () => {
	test("defines canonical STATISTICAL_QUALIFIER_TYPES accurately", () => {
		expect(STATISTICAL_QUALIFIER_TYPES).toEqual([
			"mean",
			"median",
			"mode",
			"standard_deviation",
			"standard_error",
			"variance",
			"margin_of_error",
			"confidence_interval",
			"interquartile_range",
		]);
	});

	describe("1. Zero Hardcoded Fallbacks (Unconfigured Behavior)", () => {
		test("returns empty diagnostics/match when unconfigured", () => {
			expect(resolveStatisticalQualifier("SD", {})).toEqual({
				diagnostics: [],
			});
			const ext = extractStatisticalQualifier("error of 50 mg", {});
			expect(ext.qualifierMatch).toBeUndefined();
			expect(ext.remainderText).toBe("error of 50 mg");

			// Unconfigured proportional parser only recognizes math symbols '%' and '‰', NOT English 'pct' or 'ppm'
			expect(parsePercentageValue("50%")).toBeDefined();
			expect(parsePercentageValue("50 pct")).toBeUndefined();
			expect(parsePercentageValue("100 ppm")).toBeUndefined();

			// Unconfigured ratio only recognizes ':', NOT English words 'in' or 'out of'
			expect(parseRatioValue("1:1000")).toBeDefined();
			expect(parseRatioValue("1 in 5")).toBeUndefined();
		});
	});

	describe("2. resolveStatisticalQualifier & extractStatisticalQualifier", () => {
		test("resolves central tendency, dispersion, and intervals", () => {
			const resMean = resolveStatisticalQualifier("mean", TEST_STATS_CONFIG);
			expect(resMean.qualifier?.type).toBe("mean");
			expect(resMean.qualifier?.role).toBe("central_tendency");

			const resSD = resolveStatisticalQualifier("SD", TEST_STATS_CONFIG);
			expect(resSD.qualifier?.type).toBe("standard_deviation");
			expect(resSD.qualifier?.role).toBe("dispersion_error");

			const resCI = resolveStatisticalQualifier("95% CI", TEST_STATS_CONFIG);
			expect(resCI.qualifier?.type).toBe("confidence_interval");
			expect(resCI.qualifier?.role).toBe("interval");
			expect(resCI.qualifier?.confidenceLevel).toBe(95);
		});

		test("extracts prefix statistical qualifiers and leaves remainder", () => {
			const res1 = extractStatisticalQualifier(
				"error of 50 mg",
				TEST_STATS_CONFIG,
			);
			expect(res1.qualifierMatch?.type).toBe("margin_of_error");
			expect(res1.remainderText).toBe("50 mg");

			const res2 = extractStatisticalQualifier(
				"mean of 120 mmHg",
				TEST_STATS_CONFIG,
			);
			expect(res2.qualifierMatch?.type).toBe("mean");
			expect(res2.remainderText).toBe("120 mmHg");

			const res3 = extractStatisticalQualifier(
				"95% CI 4.8-5.6",
				TEST_STATS_CONFIG,
			);
			expect(res3.qualifierMatch?.type).toBe("confidence_interval");
			expect(res3.qualifierMatch?.confidenceLevel).toBe(95);
			expect(res3.remainderText).toBe("4.8-5.6");
		});

		test("extracts postfix statistical qualifiers and leaves remainder", () => {
			const res1 = extractStatisticalQualifier(
				"120 mmHg (SD)",
				TEST_STATS_CONFIG,
			);
			expect(res1.qualifierMatch?.type).toBe("standard_deviation");
			expect(res1.remainderText).toBe("120 mmHg");

			const res2 = extractStatisticalQualifier(
				"5.2 mg (95% CI)",
				TEST_STATS_CONFIG,
			);
			expect(res2.qualifierMatch?.type).toBe("confidence_interval");
			expect(res2.qualifierMatch?.confidenceLevel).toBe(95);
			expect(res2.remainderText).toBe("5.2 mg");
		});
	});

	describe("3. Consumer Policy Enforcement (Guarding Slots against False Matches)", () => {
		test("point_estimate_only policy accepts mean but strictly rejects error/dispersion", () => {
			// Mean is central tendency -> allowed in point estimate slot
			const resMean = extractStatisticalQualifier(
				"mean of 120 mmHg",
				TEST_STATS_CONFIG,
				{ policy: "point_estimate_only" },
			);
			expect(resMean.diagnostics).toHaveLength(0);
			expect(resMean.qualifierMatch?.type).toBe("mean");

			// "error of 50 mg" is dispersion_error -> REJECTED from point estimate slot
			const resErr = extractStatisticalQualifier(
				"error of 50 mg",
				TEST_STATS_CONFIG,
				{ policy: "point_estimate_only" },
			);
			expect(resErr.qualifierMatch).toBeUndefined();
			expect(resErr.diagnostics[0]?.code).toBe("dispersion_error_rejected");
		});

		test("dispersion_only policy accepts SD and rejects mean", () => {
			const resSD = extractStatisticalQualifier("SD 5.2", TEST_STATS_CONFIG, {
				policy: "dispersion_only",
			});
			expect(resSD.diagnostics).toHaveLength(0);
			expect(resSD.qualifierMatch?.type).toBe("standard_deviation");

			const resMean = extractStatisticalQualifier(
				"mean of 120",
				TEST_STATS_CONFIG,
				{ policy: "dispersion_only" },
			);
			expect(resMean.qualifierMatch).toBeUndefined();
			expect(resMean.diagnostics[0]?.code).toBe("expected_dispersion_error");
		});

		test("allowedQualifiers explicitly allows SD while rejecting variance", () => {
			const policy = { allowedQualifiers: ["standard_deviation" as const] };

			const resSD = extractStatisticalQualifier(
				"SD 5",
				TEST_STATS_CONFIG,
				policy,
			);
			expect(resSD.diagnostics).toHaveLength(0);
			expect(resSD.qualifierMatch?.type).toBe("standard_deviation");

			const resVar = extractStatisticalQualifier(
				"variance of 10",
				TEST_STATS_CONFIG,
				policy,
			);
			expect(resVar.qualifierMatch).toBeUndefined();
			expect(resVar.diagnostics[0]?.code).toBe("qualifier_type_not_allowed");
		});

		test("reject_all_statistics rejects any statistical qualifier", () => {
			const res = extractStatisticalQualifier("mean of 50", TEST_STATS_CONFIG, {
				policy: "reject_all_statistics",
			});
			expect(res.qualifierMatch).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("statistics_rejected");
		});
	});

	describe("4. Ratios, Proportions & Fractions", () => {
		test("parses colon ratios (1:1000, 16:9)", () => {
			const res1 = parseRatioValue("1:1000");
			expect(res1?.antecedent).toBe(1);
			expect(res1?.consequent).toBe(1000);
			expect(res1?.decimalValue).toBe(0.001);

			const res2 = parseRatioValue("16:9");
			expect(res2?.antecedent).toBe(16);
			expect(res2?.consequent).toBe(9);
			expect(res2?.decimalValue).toBeCloseTo(1.7777, 3);
		});

		test("parses configured natural language proportions with localized decimals", () => {
			const ratioOptions = {
				ratioSeparators: [":", "in", "out of", "de"],
				decimalPoint: ",",
			};

			const res1 = parseRatioValue("1 in 5", ratioOptions);
			expect(res1?.antecedent).toBe(1);
			expect(res1?.consequent).toBe(5);
			expect(res1?.decimalValue).toBe(0.2);

			const res2 = parseRatioValue("1,5 in 3", ratioOptions);
			expect(res2?.antecedent).toBe(1.5);
			expect(res2?.consequent).toBe(3);
			expect(res2?.decimalValue).toBe(0.5);
		});
	});

	describe("5. Generic Proportional Scales (%, ppm, ppb, ppt, bp, custom)", () => {
		const customProportions = {
			scales: [
				{
					multiplier: 0.01,
					tokens: ["%", "pct", "percent"],
					scaleId: "percent",
				},
				{ multiplier: 0.001, tokens: ["‰"], scaleId: "permille" },
				{ multiplier: 0.0001, tokens: ["bp", "bps"], scaleId: "basis_points" },
				{ multiplier: 1e-6, tokens: ["ppm"], scaleId: "parts_per_million" },
				{ multiplier: 1e-9, tokens: ["ppb"], scaleId: "parts_per_billion" },
				{ multiplier: 1e-12, tokens: ["ppt"], scaleId: "parts_per_trillion" },
			],
		};

		test("parses standard and word percentages", () => {
			const res1 = parseProportionalValue("50%");
			expect(res1?.numericValue).toBe(50);
			expect(res1?.decimalValue).toBe(0.5);

			const res2 = parseProportionalValue("12.5 pct", customProportions);
			expect(res2?.numericValue).toBe(12.5);
			expect(res2?.decimalValue).toBe(0.125);
		});

		test("parses localized comma decimals in percentages", () => {
			const res = parseProportionalValue("12,5 %", {
				...customProportions,
				decimalPoint: ",",
			});
			expect(res?.numericValue).toBe(12.5);
			expect(res?.decimalValue).toBe(0.125);
		});

		test("parses parts per million (100 ppm)", () => {
			const res = parseProportionalValue("100 ppm", customProportions);
			expect(res?.numericValue).toBe(100);
			expect(res?.decimalValue).toBeCloseTo(0.0001, 6);
			expect(res?.scaleId).toBe("parts_per_million");
		});

		test("parses parts per billion (25 ppb)", () => {
			const res = parseProportionalValue("25 ppb", customProportions);
			expect(res?.numericValue).toBe(25);
			expect(res?.decimalValue).toBeCloseTo(25e-9, 11);
			expect(res?.scaleId).toBe("parts_per_billion");
		});

		test("parses basis points (50 bp)", () => {
			const res = parseProportionalValue("50 bp", customProportions);
			expect(res?.numericValue).toBe(50);
			expect(res?.decimalValue).toBe(0.005);
			expect(res?.scaleId).toBe("basis_points");
		});
	});

	describe("6. Adversarial Configuration (Zero Hardcoded Semantic Assumptions)", () => {
		test("respects swapped qualifier mappings without heuristic inference", () => {
			const swappedStats: StatisticalConfig = {
				qualifierAliases: {
					variance: ["mean of", "mean", "average"],
					mean: ["variance"],
				},
			};

			const res1 = resolveStatisticalQualifier("mean", swappedStats);
			expect(res1.qualifier?.type).toBe("variance");
			expect(res1.qualifier?.role).toBe("dispersion_error");

			const res2 = extractStatisticalQualifier("mean of 50", swappedStats);
			expect(res2.qualifierMatch?.type).toBe("variance");
			expect(res2.remainderText).toBe("50");

			// When only 'mean' is configured, 'of' is NOT magically consumed by runtime
			const bareStats: StatisticalConfig = {
				qualifierAliases: {
					variance: ["mean"],
				},
			};
			const res3 = extractStatisticalQualifier("mean of 50", bareStats);
			expect(res3.qualifierMatch?.type).toBe("variance");
			expect(res3.remainderText).toBe("of 50");
		});

		test("respects custom user multipliers without heuristic inference", () => {
			// Purposely configure '%' as 1e-6 (ppm) and 'custom_factor' as 0.5
			const swappedProportions = {
				scales: [
					{ multiplier: 1e-6, tokens: ["%"], scaleId: "custom_ppm" },
					{ multiplier: 0.5, tokens: ["half"], scaleId: "half_factor" },
				],
			};

			const res1 = parseProportionalValue("50%", swappedProportions);
			expect(res1?.scaleId).toBe("custom_ppm");
			expect(res1?.decimalValue).toBeCloseTo(50 * 1e-6, 8);

			const res2 = parseProportionalValue("10 half", swappedProportions);
			expect(res2?.scaleId).toBe("half_factor");
			expect(res2?.decimalValue).toBe(5);
		});
	});
});
