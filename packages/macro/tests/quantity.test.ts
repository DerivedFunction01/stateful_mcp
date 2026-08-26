import { describe, expect, test } from "bun:test";
import {
	parseQuantity,
	QuantityConversionRegistry,
	type QuantityGrammarConfig,
} from "../src";
import { multiplicativeTransform } from "../src/values/conversion/transforms";

// Initialize a standard test conversion registry for dimensional validation
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
	id: "[cup_us]",
	dimension: "volume",
	canonicalUnit: "mL",
	composable: true,
	transform: multiplicativeTransform(236.588),
});

const TEST_CONFIG: QuantityGrammarConfig = {
	unitAliases: {
		mg: ["mg", "milligram", "milligrams", "miligramos", "毫克"],
		g: ["g", "gram", "grams", "gramos", "克"],
		kg: ["kg", "kilogram", "kilograms", "kilo", "公斤"],
		mL: ["mL", "ml", "milliliter", "mililitros", "毫升"],
		L: ["L", "l", "liter", "liters", "litros", "升"],
		"[cup_us]": ["cup", "cups", "taza", "tazas", "杯"],
	},
	rangeDelimiters: ["down to", "to", "until", "-", "bis", "a", "至", "到"],
	operatorConfig: {
		prefixAliases: {
			greater_equal: [">=", "at least", "al menos"],
			less_equal: ["<=", "at most", "como máximo"],
			approximate: ["~", "approx", "cerca de"],
		},
	},
	statisticalConfig: {
		qualifierAliases: {
			mean: ["mean of", "mean", "promedio"],
			standard_deviation: ["SD of", "SD"],
			margin_of_error: ["error of", "error"],
		},
	},
	conversionRegistry: registry,
};

describe("Universal Quantity & Range Engine (quantity.ts)", () => {
	test("uses an explicit range fundamental when configured", () => {
		const result = parseQuantity(
			"from 20 mg to 50 mg",
			{
				fundamentalGroups: [
					{
						id: "range",
						variants: [
							{
								id: "from-to",
								prefix: [{ id: "from", text: "from" }],
								connectors: [[{ id: "to", text: "to" }]],
								slots: [
									{ id: "start", pattern: ".+?" },
									{ id: "end", pattern: ".+?" },
								],
							},
						],
					},
				],
				unitAliases: { mg: ["mg"] },
			},
			{ allowRange: true },
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.value?.range?.start.magnitude).toBe(20);
		expect(result.value?.range?.end.magnitude).toBe(50);
	});
	describe("1. Single Quantities & Multi-Lingual Unit Resolution", () => {
		test("parses standard quantities and resolves aliases to canonical units", () => {
			const res1 = parseQuantity("50 mg", TEST_CONFIG);
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.value?.primaryQuantity.magnitude).toBe(50);
			expect(res1.value?.primaryQuantity.unit).toBe("mg");
			expect(res1.value?.primaryQuantity.canonicalMagnitude).toBe(0.05); // 50 * 0.001 g

			const res2 = parseQuantity("3 tazas", TEST_CONFIG);
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.value?.primaryQuantity.unit).toBe("[cup_us]");
			expect(res2.value?.primaryQuantity.canonicalMagnitude).toBeCloseTo(
				3 * 236.588,
				2,
			);

			const resCJK = parseQuantity("50 毫克", TEST_CONFIG);
			expect(resCJK.diagnostics).toHaveLength(0);
			expect(resCJK.value?.primaryQuantity.unit).toBe("mg");
		});

		test("parses quantities with operators and statistical qualifiers", () => {
			const res = parseQuantity(">= 50 mg", TEST_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.operator?.operator).toBe("greater_equal");
			expect(res.value?.primaryQuantity.magnitude).toBe(50);

			const resStat = parseQuantity("mean of 100 mL", TEST_CONFIG);
			expect(resStat.diagnostics).toHaveLength(0);
			expect(resStat.value?.statisticalQualifier?.type).toBe("mean");
			expect(resStat.value?.primaryQuantity.magnitude).toBe(100);
		});
	});

	describe("2. Heterogeneous Unit Ranges (e.g. 50 mg to 1 g)", () => {
		test("parses heterogeneous range and validates dimension compatibility", () => {
			const res = parseQuantity("50 mg to 1 g", TEST_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range).toBeDefined();
			expect(res.value?.range?.start.magnitude).toBe(50);
			expect(res.value?.range?.start.unit).toBe("mg");
			expect(res.value?.range?.end.magnitude).toBe(1);
			expect(res.value?.range?.end.unit).toBe("g");
			expect(res.value?.range?.isHeterogeneousUnits).toBe(true);
			expect(res.value?.range?.direction).toBe("ascending"); // 0.05 g < 1 g
		});

		test("rejects incompatible cross-dimensional range endpoints (e.g. 50 mg to 1 L)", () => {
			const res = parseQuantity("50 mg to 1 L", TEST_CONFIG);
			expect(res.value).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("incompatible_range_dimensions");
		});
	});

	describe("3. Descending & Directional Ranges (e.g. 20 mg down to 5 mg)", () => {
		test("parses descending range and marks direction as descending", () => {
			const res = parseQuantity("20 mg down to 5 mg", TEST_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.direction).toBe("descending");
			expect(res.value?.range?.start.magnitude).toBe(20);
			expect(res.value?.range?.end.magnitude).toBe(5);
		});

		test("inherits trailing unit across range (e.g. 10 to 20 mg)", () => {
			const res = parseQuantity("10 to 20 mg", TEST_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.start.magnitude).toBe(10);
			expect(res.value?.range?.start.unit).toBe("mg");
			expect(res.value?.range?.end.magnitude).toBe(20);
			expect(res.value?.range?.end.unit).toBe("mg");
		});
	});

	describe("4. Chained Step Sequences (e.g. 10 to 20 to 40 mg)", () => {
		test("parses multi-step chained sequences", () => {
			const res = parseQuantity("10 to 20 to 40 mg", TEST_CONFIG, {
				allowRange: true,
				allowChainedSteps: true,
			});
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.chainedSteps).toHaveLength(3);
			expect(res.value?.range?.chainedSteps?.[0]?.magnitude).toBe(10);
			expect(res.value?.range?.chainedSteps?.[1]?.magnitude).toBe(20);
			expect(res.value?.range?.chainedSteps?.[2]?.magnitude).toBe(40);
		});

		test("rejects chained steps when policy disallows it", () => {
			const res = parseQuantity("10 to 20 to 40 mg", TEST_CONFIG, {
				allowRange: true,
				allowChainedSteps: false,
			});
			expect(res.value).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("chained_steps_not_allowed");
		});
	});

	describe("5. Consumer Policy Enforcement", () => {
		test("enforces allowedUnits policy", () => {
			const resValid = parseQuantity("50 mg", TEST_CONFIG, {
				allowedUnits: ["mg", "g"],
			});
			expect(resValid.diagnostics).toHaveLength(0);

			const resInvalid = parseQuantity("50 kg", TEST_CONFIG, {
				allowedUnits: ["mg", "g"],
			});
			expect(resInvalid.value).toBeUndefined();
			expect(resInvalid.diagnostics[0]?.code).toBe("unit_not_allowed");
		});

		test("enforces allowedDimensions policy", () => {
			const resMass = parseQuantity("50 mg", TEST_CONFIG, {
				allowedDimensions: ["mass"],
			});
			expect(resMass.diagnostics).toHaveLength(0);

			const resVolume = parseQuantity("50 mL", TEST_CONFIG, {
				allowedDimensions: ["mass"],
			});
			expect(resVolume.value).toBeUndefined();
			expect(resVolume.diagnostics[0]?.code).toBe("dimension_not_allowed");
		});

		test("enforces allowDirectionalRange policy (rejects descending if false)", () => {
			const res = parseQuantity("20 mg down to 5 mg", TEST_CONFIG, {
				allowRange: true,
				allowDirectionalRange: false,
			});
			expect(res.value).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("descending_range_not_allowed");
		});

		test("enforces statistical qualifier policy via Quantity engine", () => {
			const res = parseQuantity("error of 50 mg", TEST_CONFIG, {
				statisticsPolicy: { policy: "point_estimate_only" },
			});
			expect(res.value).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("dispersion_error_rejected");
		});
	});

	describe("6. Adversarial Configuration (Zero Hardcoded Delimiters/Units)", () => {
		test("respects custom user range delimiters without hardcoded defaults", () => {
			// Purposely use '~~' as the only range delimiter
			const customConfig: QuantityGrammarConfig = {
				unitAliases: { mg: ["mg"] },
				rangeDelimiters: ["~~"],
			};

			const res = parseQuantity("10 mg ~~ 20 mg", customConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.start.magnitude).toBe(10);
			expect(res.value?.range?.end.magnitude).toBe(20);

			// Standard 'to' is NOT recognized as a delimiter when unconfigured
			const resTo = parseQuantity("10 mg to 20 mg", customConfig);
			expect(resTo.value?.range).toBeUndefined();
		});
	});
});
