import { describe, expect, test } from "bun:test";
import type { MacroDefinitionAdapter } from "../src/contracts/composition";
import { createMacroRuntimeContext } from "../src/contracts/context";
import {
	executeMacroWithAdapter,
	parseMacroWithAdapter,
} from "../src/runtime/macro-runtime";
import {
	QuantityConversionRegistry,
	functionalTransform,
	multiplicativeTransform,
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
				{ factors: [{ unitId: "C", exponent: 1 }, { unitId: "s", exponent: -1 }] },
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
								diagnostics: [{
									code: "NO_MATCH",
									message: `Unknown unit '${unit}'`,
								}],
							};
						}
						return {
							status: "accepted",
							binding: {
								canonicalValue: { magnitude: canonical, unit: "m" },
							},
							previewValues: [{
								argumentId: "quantity",
								previewKey: "canonical",
								value: `${canonical} m`,
								status: "bound",
							}],
						};
					},
				},
			},
			compile: (bindings) => bindings[0]?.binding?.canonicalValue,
		};

		const draft = await parseMacroWithAdapter(
			adapter,
			"^convert quantity=125 cm",
			{ context: createMacroRuntimeContext() },
		);
		expect(draft.preview.text).toBe("canonical: 1.25 m");
		expect(draft.executionPreview?.status).toBe("valid");
		await expect(executeMacroWithAdapter(adapter, draft)).resolves.toEqual({
			magnitude: 1.25,
			unit: "m",
		});
	});
});
