import { describe, expect, test } from "bun:test";
import type { MacroDefinitionAdapter } from "../src/contracts/composition";
import { createMacroRuntimeContext } from "../src/contracts/context";
import {
	executeMacroWithAdapter,
	parseMacroWithAdapter,
} from "../src/runtime/macro-runtime";
import {
	createCommonConversionRegistry,
	functionalTransform,
	getCommonUnitExpression,
	multiplicativeTransform,
	QuantityConversionRegistry,
} from "../src/values/conversion";
import { createMeasurementValue } from "../src/values/measurement";

function registerDistance(registry: QuantityConversionRegistry): void {
	registry.registerUnit({
		id: "m",
		dimension: "distance",
		canonicalUnit: "m",
		transform: multiplicativeTransform(1),
		composable: true,
	});
	registry.registerUnit({
		id: "cm",
		dimension: "distance",
		canonicalUnit: "m",
		transform: multiplicativeTransform(0.01),
		composable: true,
	});
	registry.registerUnit({
		id: "s",
		dimension: "time",
		canonicalUnit: "s",
		transform: multiplicativeTransform(1),
		composable: true,
	});
}

describe("generic quantity conversion", () => {
	test("converts atomic units in both directions", () => {
		const registry = new QuantityConversionRegistry();
		registerDistance(registry);

		expect(registry.convertToCanonical("distance", "cm", 125)).toBe(1.25);
		expect(registry.convertFromCanonical("distance", "cm", 1.25)).toBe(125);
		expect(registry.getDimensions()).toEqual(["distance", "time"]);
		expect(registry.getUnits("distance")).toEqual(["cm", "m"]);
	});

	test("composes numerator and denominator units", () => {
		const registry = new QuantityConversionRegistry();
		registry.registerUnit({
			id: "g",
			dimension: "mass",
			canonicalUnit: "g",
			transform: multiplicativeTransform(1),
			composable: true,
		});
		registry.registerUnit({
			id: "mg",
			dimension: "mass",
			canonicalUnit: "g",
			transform: multiplicativeTransform(0.001),
			composable: true,
		});
		registry.registerUnit({
			id: "L",
			dimension: "volume",
			canonicalUnit: "L",
			transform: multiplicativeTransform(1),
			composable: true,
		});
		registry.registerUnit({
			id: "dL",
			dimension: "volume",
			canonicalUnit: "L",
			transform: multiplicativeTransform(0.1),
			composable: true,
		});

		expect(
			registry.convert(
				{
					factors: [
						{ unitId: "mg", exponent: 1 },
						{ unitId: "dL", exponent: -1 },
					],
				},
				{
					factors: [
						{ unitId: "g", exponent: 1 },
						{ unitId: "L", exponent: -1 },
					],
				},
				1,
			),
		).toBe(0.01);
	});

	test("normalizes exponents and dimensions deterministically", () => {
		const registry = new QuantityConversionRegistry();
		registerDistance(registry);

		expect(
			registry.normalize({
				factors: [
					{ unitId: "s", exponent: -1 },
					{ unitId: "cm", exponent: 1 },
					{ unitId: "cm", exponent: 1 },
				],
			}),
		).toEqual({
			factors: [
				{ unitId: "cm", exponent: 2 },
				{ unitId: "s", exponent: -1 },
			],
			dimensionVector: { distance: 2, time: -1 },
		});
	});

	test("rejects incompatible or non-composable compound units", () => {
		const registry = new QuantityConversionRegistry();
		registerDistance(registry);
		registry.registerUnit({
			id: "C",
			dimension: "temperature",
			canonicalUnit: "K",
			transform: functionalTransform(
				(value) => value + 273.15,
				(value) => value - 273.15,
				"affine",
			),
			composable: false,
		});

		expect(
			registry.convert(
				{ factors: [{ unitId: "cm", exponent: 1 }] },
				{ factors: [{ unitId: "s", exponent: 1 }] },
				1,
			),
		).toBeUndefined();
		expect(
			registry.convert(
				{ factors: [{ unitId: "C", exponent: 1 }] },
				{
					factors: [
						{ unitId: "C", exponent: 1 },
						{ unitId: "s", exponent: -1 },
					],
				},
				1,
			),
		).toBeUndefined();
	});

	test("keeps opaque measurements outside conversion", () => {
		const value = createMeasurementValue(7, "opaque-unit", {
			dimension: "opaque",
		});

		expect(value).toMatchObject({
			kind: "quantity",
			magnitude: 7,
			unit: "opaque-unit",
			dimension: "opaque",
		});
	});

	test("rejects conflicting unit dimensions", () => {
		const registry = new QuantityConversionRegistry();
		registerDistance(registry);

		expect(() =>
			registry.registerUnit({
				id: "m",
				dimension: "time",
				canonicalUnit: "s",
				transform: multiplicativeTransform(1),
				composable: true,
			}),
		).toThrow("already registered");
	});

	test("uses the resolved canonical value for preview and execution", async () => {
		const registry = new QuantityConversionRegistry();
		registry.registerUnit({
			id: "m",
			dimension: "distance",
			canonicalUnit: "m",
			transform: multiplicativeTransform(1),
			composable: true,
		});
		registry.registerUnit({
			id: "cm",
			dimension: "distance",
			canonicalUnit: "m",
			transform: multiplicativeTransform(0.01),
			composable: true,
		});
		const adapter: MacroDefinitionAdapter = {
			definition: {
				id: "generic.convert",
				name: "convert",
				version: 1,
				arguments: [
					{
						argumentId: "quantity",
						name: "quantity",
						path: "quantity",
						matcher: {
							kind: "pattern",
							pattern: "(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>cm|m)",
						},
						required: true,
					},
				],
				matching: { mode: "unordered", positionalFallback: true },
			},
			previewTemplate: {
				version: 1,
				parts: [
					{ kind: "literal", text: "canonical: " },
					{
						kind: "slot",
						argumentId: "quantity",
						occurrence: 0,
						previewKey: "canonical",
					},
				],
			},
			children: {
				quantity: {
					type: "generic-quantity",
					validate: ({ input }) => {
						const magnitude = Number(input.captures?.magnitude);
						const unit = String(input.captures?.unit ?? "");
						const canonical = registry.convertToCanonical(
							"distance",
							unit,
							magnitude,
						);
						if (canonical === undefined) {
							return {
								status: "invalid",
								diagnostics: [
									{
										code: "NO_MATCH",
										message: `Unknown unit '${unit}'`,
									},
								],
							};
						}
						return {
							status: "accepted",
							binding: {
								canonicalValue: { magnitude: canonical, unit: "m" },
							},
							previewValues: [
								{
									argumentId: "quantity",
									previewKey: "canonical",
									value: `${canonical} m`,
									status: "bound",
								},
							],
						};
					},
				},
			},
			compile: (bindings) => bindings[0]?.binding?.canonicalValue,
		};

		const draft = await parseMacroWithAdapter(
			adapter,
			"^convert quantity=125 cm",
			{ context: createMacroRuntimeContext({ macroStartToken: "^" }) },
		);
		expect(draft.preview.text).toBe("canonical: 1.25 m");
		expect(draft.executionPreview?.status).toBe("valid");
		await expect(executeMacroWithAdapter(adapter, draft)).resolves.toEqual({
			magnitude: 1.25,
			unit: "m",
		});
	});

	test("loads common symbols opt-in with logical canonical units", () => {
		const empty = new QuantityConversionRegistry();
		expect(empty.getDimensions()).toEqual([]);

		const registry = createCommonConversionRegistry();
		expect(registry.getUnit("meters")).toBeUndefined();
		expect(registry.convertToCanonical("mass", "mg", 1000)).toBe(0.001);
		expect(registry.convertToCanonical("volume", "mL", 1)).toBe(0.001);
		expect(registry.convertToCanonical("time", "s", 86_400)).toBe(1);
		expect(registry.convertToCanonical("time", "wk", 1)).toBe(7);
		expect(registry.convertToCanonical("time", "mo", 1)).toBeCloseTo(30.436875);
		expect(registry.convertToCanonical("time", "a", 1)).toBeCloseTo(365.2425);
		expect(registry.convertToCanonical("length", "[ft_i]", 1)).toBe(0.3048);
		expect(registry.convertToCanonical("mass", "[lb_av]", 1)).toBeCloseTo(
			0.45359237,
		);
	});

	test("supports selected common bundles and canonical overrides", () => {
		const registry = createCommonConversionRegistry({
			bundles: ["us-customary"],
			canonicalUnits: { mass: "kg" },
		});
		expect(registry.getUnit("[ft_i]")).toBeDefined();
		expect(registry.getUnit("m")).toBeDefined();
		expect(registry.getUnit("meters")).toBeUndefined();
		expect(registry.convertToCanonical("mass", "[lb_av]", 1)).toBeCloseTo(
			0.45359237,
		);
	});

	test("converts common derived units across physical dimensions", () => {
		const registry = createCommonConversionRegistry();
		expect(
			registry.convert(
				getCommonUnitExpression("m/s"),
				getCommonUnitExpression("km/h"),
				1,
			),
		).toBeCloseTo(3.6);
		expect(
			registry.convert(
				getCommonUnitExpression("[mi_i]/h"),
				getCommonUnitExpression("m/s"),
				1,
			),
		).toBeCloseTo(0.44704);
		expect(
			registry.convert(
				getCommonUnitExpression("m/s2"),
				getCommonUnitExpression("km/h2"),
				1,
			),
		).toBeCloseTo(12_960);
		expect(
			registry.convert(
				getCommonUnitExpression("L/min"),
				getCommonUnitExpression("mL/s"),
				1,
			),
		).toBeCloseTo(16.6666666667);
		expect(
			registry.convert(
				getCommonUnitExpression("kg/s"),
				getCommonUnitExpression("[lb_av]/h"),
				1,
			),
		).toBeCloseTo(7_936.641438, 3);
		expect(
			registry.convert(
				{ factors: [{ unitId: "mL", exponent: 1 }] },
				{ factors: [{ unitId: "cm", exponent: 3 }] },
				1,
			),
		).toBeCloseTo(1);
		expect(
			registry.convert(
				{ factors: [{ unitId: "J", exponent: 1 }] },
				{
					factors: [
						{ unitId: "N", exponent: 1 },
						{ unitId: "m", exponent: 1 },
					],
				},
				1,
			),
		).toBeCloseTo(1);
		expect(
			registry.convert(
				{ factors: [{ unitId: "kPa", exponent: 1 }] },
				{
					factors: [
						{ unitId: "N", exponent: 1 },
						{ unitId: "m", exponent: -2 },
					],
				},
				1,
			),
		).toBeCloseTo(1000);
		expect(
			registry.convert(
				{
					factors: [
						{ unitId: "mg", exponent: 1 },
						{ unitId: "dL", exponent: -1 },
					],
				},
				{
					factors: [
						{ unitId: "g", exponent: 1 },
						{ unitId: "L", exponent: -1 },
					],
				},
				1,
			),
		).toBeCloseTo(0.01);
		expect(
			registry.convert(
				{
					factors: [
						{ unitId: "[lbf_av]", exponent: 1 },
						{ unitId: "[ft_i]", exponent: 1 },
					],
				},
				{ factors: [{ unitId: "J", exponent: 1 }] },
				1,
			),
		).toBeCloseTo(1.355817948, 8);
		expect(
			registry.convert(
				getCommonUnitExpression("m2"),
				getCommonUnitExpression("cm2"),
				1,
			),
		).toBeCloseTo(10_000);
	});
});
