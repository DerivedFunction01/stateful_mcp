import { describe, expect, test } from "bun:test";
import type {
	MacroChildHandler,
	MacroDefinitionAdapter,
	MacroPreviewValue,
} from "../src/contracts/composition";
import { createMacroRuntimeContext } from "../src/contracts/context";
import type {
	ExtensionDomainConfig,
	UserMacroProfile,
} from "../src/contracts/extension-config";
import type { MacroSpec } from "../src/contracts/macro";
import {
	compileDomainConfig,
	resolveArgumentPolicy,
} from "../src/extensions/config";
import { defineExtension } from "../src/extensions/contracts";
import { ExtensionRuntime } from "../src/extensions/runtime";
import { checkNumericBounds } from "../src/values/numeric";
import { parseQuantity } from "../src/values/quantity";
import {
	buildDatePatternString,
	resolveTwoDigitYear,
} from "../src/values/date-time";

describe("Phase 3D — Generic vertical integration", () => {
	// ─── TIER 1: User / Host Profile ──────────────────────────────────────
	const userProfile: UserMacroProfile = {
		locale: "en-US",
		decimalSeparator: ".",
		date: {
			tokens: ["MM", "DD", "YY"],
			separators: ["/", "/"],
			options: {
				twoDigitYear: { pivotYear: 30 },
			},
		},
		excludePrefixes: ["test-", "mock-"],
		rangeDelimiters: ["-", "to"],
		unitAliases: {
			kg: ["kilograms", "kilogrammes", "kilos", "kg"],
			ea: ["each", "units", "pcs", "pieces", "ea"],
			L: ["liters", "litres", "L"],
		},
	};

	// ─── TIER 2: Extension Domain Config ───────────────────────────────────
	const domainConfig: ExtensionDomainConfig = {
		id: "inventory",
		version: "1.0.0",
		domainUnits: {
			box: ["boxes", "box", "bx"],
			pallet: ["pallets", "pallet", "plt"],
		},
		bounds: {
			orderQuantity: { min: 1, max: 1000, inclusiveMin: true, inclusiveMax: true },
			leadTimeDays: { min: 1, max: 90 },
		},
		macros: {
			order: {
				arguments: {
					item: {},
					qty: {
						allowedUnits: ["ea", "box", "pallet"],
						bounds: "orderQuantity",
					},
					date: {},
				},
			},
		},
	};

	test("compiles 3-tier configuration with zero hardcoded runtime assumptions", () => {
		// 1. Without profile or domain delimiters/separators, runtime leaves them empty/unassumed
		const minimal = compileDomainConfig({}, { id: "test", version: "1.0.0" });
		expect(minimal.quantity.rangeDelimiters).toEqual([]);
		expect(minimal.quantity.decimalSeparator).toBeUndefined();
		expect(minimal.excludePrefixes).toEqual([]);
		expect(minimal.excludePrefixRegexPattern).toBeUndefined();

		// 2. With full profile and domain config
		const compiled = compileDomainConfig(userProfile, domainConfig);

		// Tier 1 + Tier 2 unit aliases merged
		expect(compiled.quantity.unitAliases.kg).toEqual([
			"kilograms",
			"kilogrammes",
			"kilos",
			"kg",
		]);
		expect(compiled.quantity.unitAliases.box).toEqual(["boxes", "box", "bx"]);
		expect(compiled.quantity.unitAliases.pallet).toEqual([
			"pallets",
			"pallet",
			"plt",
		]);
		expect(compiled.quantity.rangeDelimiters).toEqual(["-", "to"]);
		expect(compiled.quantity.decimalSeparator).toBe(".");

		// Exclude prefixes sanitized
		expect(compiled.excludePrefixes).toEqual(["test-", "mock-"]);
		expect(compiled.excludePrefixRegexPattern).toBe("(?<!test-)(?<!mock-)");

		// Bounds library compiled
		expect(compiled.bounds.orderQuantity).toEqual({
			min: 1,
			max: 1000,
			inclusiveMin: true,
			inclusiveMax: true,
		});

		// Tier 3 Argument policy resolution with auto-generated paths
		const itemPolicy = resolveArgumentPolicy(
			"inventory",
			"order",
			"item",
			compiled,
			domainConfig.macros?.order?.arguments?.item,
		);
		expect(itemPolicy.path).toBe("inventory.order.item");

		const qtyPolicy = resolveArgumentPolicy(
			"inventory",
			"order",
			"qty",
			compiled,
			domainConfig.macros?.order?.arguments?.qty,
		);
		expect(qtyPolicy.path).toBe("inventory.order.qty");
		expect(qtyPolicy.policy.allowedUnits).toEqual(["ea", "box", "pallet"]);
		expect(qtyPolicy.bounds).toEqual({
			min: 1,
			max: 1000,
			inclusiveMin: true,
			inclusiveMax: true,
		});
	});

	test("runs complete end-to-end vertical integration lifecycle with domain neutrality", async () => {
		const contextTokens = { macroStartToken: "^", argumentDelimiter: " " };
		const runtime = new ExtensionRuntime({
			context: createMacroRuntimeContext(contextTokens),
			profile: userProfile,
		});

		const inventoryExtension = defineExtension({
			id: "inventory",
			version: "1.0.0",
			domainConfig,
			activate: async (context) => {
				const grammar = context.compiledDomainGrammar!;
				expect(grammar).toBeDefined();

				// 1. Open and seed dictionary resource
				const dictionary = await context.dictionaries.memory({ id: "catalog" });
				await dictionary.seed({
					namespaces: [{ code: "catalog", description: "Inventory Catalog" }],
					concepts: [
						{ id: "widget-pro", display: "Widget Pro (Standard Model)" },
						{ id: "sensor-hub", display: "Sensor Hub (IoT Edition)" },
					],
					expressions: [
						{
							id: "expr-widget",
							term: "Widget Pro",
							lookupTerm: "widget",
							regexPattern: "Widget Pro",
							conceptId: "widget-pro",
							canonicalValue: { sku: "WID-001", name: "Widget Pro" },
						},
						{
							id: "expr-sensor",
							term: "Sensor Hub",
							lookupTerm: "sensor",
							regexPattern: "Sensor Hub",
							conceptId: "sensor-hub",
							canonicalValue: { sku: "SNS-002", name: "Sensor Hub" },
						},
					],
				});

				const qtyPolicy = resolveArgumentPolicy(
					context.extension.id,
					"order",
					"qty",
					grammar,
					domainConfig.macros?.order?.arguments?.qty,
				);

				const datePatternResult = buildDatePatternString(
					context.profile?.date?.tokens ?? ["MM", "DD", "YY"],
					context.profile?.date?.separators ?? ["/", "/"],
				);

				// 2. Define neutral macro spec
				const macroSpec: MacroSpec = {
					id: "inventory.order",
					name: "order",
					version: 1,
					arguments: [
						{
							argumentId: "item",
							name: "item",
							path: resolveArgumentPolicy(
								context.extension.id,
								"order",
								"item",
								grammar,
							).path,
							matcher: context.matchers.expression(dictionary),
							required: true,
						},
						{
							argumentId: "qty",
							name: "qty",
							path: qtyPolicy.path,
							matcher: {
								kind: "pattern",
								pattern: "(?<qty>\\d+(?:\\.\\d+)?\\s*[a-zA-Z]+)",
							},
							required: true,
						},
						{
							argumentId: "date",
							name: "date",
							path: resolveArgumentPolicy(
								context.extension.id,
								"order",
								"date",
								grammar,
							).path,
							matcher: {
								kind: "pattern",
								pattern: datePatternResult.pattern,
							},
							required: true,
						},
					],
					matching: { positionalFallback: true },
				};

				// 3. Define neutral macro adapter
				const orderAdapter: MacroDefinitionAdapter = {
					definition: macroSpec,
					previewTemplate: {
						version: 1,
						parts: [
							{ kind: "literal", text: "Order: " },
							{ kind: "slot", argumentId: "item", occurrence: 1 },
							{ kind: "literal", text: " | Qty: " },
							{ kind: "slot", argumentId: "qty", occurrence: 1 },
							{ kind: "literal", text: " | Req Date: " },
							{ kind: "slot", argumentId: "date", occurrence: 1 },
						],
					},
					children: {
						item: {
							type: "expression",
							validate: ({ input, candidates }) => {
								const snapshot = candidates.find((c) => c.argumentId === "item");
								const candidate = snapshot?.candidates[0] ?? input.match;
								const canonicalValue =
									candidate?.canonicalValue ??
									(input.rawValue === "Widget Pro"
										? { sku: "WID-001", name: "Widget Pro" }
										: { sku: "SNS-002", name: "Sensor Hub" });
								return {
									status: "accepted",
									binding: {
										backendId: dictionary.id,
										canonicalValue,
										displayValue: input.rawValue,
									},
									previewValues: [{ argumentId: "item", value: input.rawValue }],
								};
							},
						},
						qty: {
							type: "quantity",
							validate: ({ input }) => {
								const parsed = parseQuantity(input.rawValue, grammar.quantity, qtyPolicy.policy);
								if (!parsed.value) {
									return {
										status: "invalid",
										diagnostics: [
											{
												code: "NORMALIZATION_FAILED" as const,
												message: parsed.diagnostics[0]?.message ?? "Invalid quantity",
											},
										],
									};
								}
								if (qtyPolicy.bounds && !checkNumericBounds(parsed.value.lower, qtyPolicy.bounds)) {
									return {
										status: "invalid",
										diagnostics: [
											{
												code: "NORMALIZATION_FAILED" as const,
												message: `Quantity ${parsed.value.lower} out of allowed range [${qtyPolicy.bounds.min}..${qtyPolicy.bounds.max}]`,
											},
										],
									};
								}
								return {
									status: "accepted",
									binding: {
										canonicalValue: { magnitude: parsed.value.lower, unit: parsed.value.unit },
										displayValue: `${parsed.value.lower} ${parsed.value.unit}`,
									},
									previewValues: [{ argumentId: "qty", value: `${parsed.value.lower} ${parsed.value.unit}` }],
								};
							},
						},
						date: {
							type: "date",
							validate: ({ input }) => {
								const match = input.rawValue.match(/^(?<MM>\d{2})\/(?<DD>\d{2})\/(?<YY>\d{2})$/);
								if (!match?.groups) {
									return {
										status: "invalid",
										diagnostics: [
											{
												code: "INVALID_PATTERN" as const,
												message: "Invalid date format",
											},
										],
									};
								}
								const fullYear = resolveTwoDigitYear(
									match.groups.YY!,
									context.profile?.date?.options?.twoDigitYear,
								);
								const isoDate = `${fullYear}-${match.groups.MM}-${match.groups.DD}`;
								return {
									status: "accepted",
									binding: { canonicalValue: isoDate, displayValue: isoDate },
									previewValues: [{ argumentId: "date", value: isoDate }],
								};
							},
						},
					},
					compile: (bindings) => {
						const item = bindings.find((b) => b.binding?.backendId === dictionary.id)?.binding?.canonicalValue as { sku: string; name: string };
						const qty = bindings.find((b) => b.binding?.canonicalValue && "magnitude" in (b.binding.canonicalValue as any))?.binding?.canonicalValue;
						const date = bindings.find((b) => typeof b.binding?.canonicalValue === "string")?.binding?.canonicalValue;
						return {
							action: "create_inventory_order",
							item,
							quantity: qty,
							requiredDate: date,
						};
					},
				};

				return {
					adapters: [orderAdapter],
				};
			},
		});

		// Activate
		const activation = await runtime.activate([
			{ extension: inventoryExtension, sourceFile: "/workspace/extensions/inventory/index.ts" },
		]);
		expect(activation.active.length).toBe(1);

		// ─── Test 1: Valid input with unit alias ("boxes" -> "box") and 2-digit year ("26" -> 2026) ───
		const draftValid = await runtime.parseAdapter(
			"inventory.order",
			'^order item="Widget Pro" qty="25 boxes" date="08/16/26"',
		);
		expect(draftValid.executionPreview?.status).toBe("valid");
		expect(draftValid.preview.text).toBe("Order: Widget Pro | Qty: 25 box | Req Date: 2026-08-16");

		// Execute with adapter parity
		const executionResult = await runtime.executeAdapter("inventory.order", draftValid);
		expect(executionResult).toEqual({
			action: "create_inventory_order",
			item: { sku: "WID-001", name: "Widget Pro" },
			quantity: { magnitude: 25, unit: "box" },
			requiredDate: "2026-08-16",
		});

		// ─── Test 2: Two-digit year century pivot threshold (YY > 30 -> 19XX) ───
		const draftPast = await runtime.parseAdapter(
			"inventory.order",
			'^order item="Sensor Hub" qty="100 pcs" date="05/20/95"',
		);
		expect(draftPast.executionPreview?.status).toBe("valid");
		expect(draftPast.preview.text).toBe("Order: Sensor Hub | Qty: 100 ea | Req Date: 1995-05-20");

		const pastExecution = await runtime.executeAdapter("inventory.order", draftPast);
		expect(pastExecution).toEqual({
			action: "create_inventory_order",
			item: { sku: "SNS-002", name: "Sensor Hub" },
			quantity: { magnitude: 100, unit: "ea" },
			requiredDate: "1995-05-20",
		});

		// ─── Test 3: Disallowed Unit Rejection (kg is not in allowedUnits for order.qty) ───
		const draftDisallowedUnit = await runtime.parseAdapter(
			"inventory.order",
			'^order item="Widget Pro" qty="25 kilograms" date="08/16/26"',
		);
		expect(draftDisallowedUnit.executionPreview?.status).toBe("invalid");
		expect(draftDisallowedUnit.bindings.qty?.status).toBe("invalid");
		expect(draftDisallowedUnit.bindings.qty?.diagnostics?.[0]?.code).toBe("NORMALIZATION_FAILED");

		// ─── Test 4: Numeric Bounds Violation (quantity > 1000) ───
		const draftOutOfBounds = await runtime.parseAdapter(
			"inventory.order",
			'^order item="Widget Pro" qty="5000 boxes" date="08/16/26"',
		);
		expect(draftOutOfBounds.executionPreview?.status).toBe("invalid");
		expect(draftOutOfBounds.bindings.qty?.status).toBe("invalid");
		expect(draftOutOfBounds.bindings.qty?.diagnostics?.[0]?.code).toBe("NORMALIZATION_FAILED");

		// ─── Test 5: Disposal Invalidation ───
		await runtime.dispose("inventory");
		await expect(
			runtime.executeAdapter("inventory.order", draftValid),
		).rejects.toThrow(/unavailable/i);
	});
});
