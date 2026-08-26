import { describe, expect, test } from "bun:test";
import {
	createQuantityConversionRegistry,
	identityTransform,
	multiplicativeTransform,
} from "../src/values/conversion/conversion-registry";
import {
	parseQuantity,
	type QuantityGrammarConfig,
	resolveQuantityGrammarAsync,
} from "../src/values/quantity";
import { parseCompoundRate } from "../src/values/rates";

describe("Quantified Concepts & Discrete Packaging Units", () => {
	// Setup Conversion Registry with Namespaced Discrete Concepts
	const registry = createQuantityConversionRegistry();

	// Discrete Nitrile Gloves dimension
	registry.registerUnit({
		id: "inventory::gloves_single",
		dimension: "discrete::nitrile_gloves",
		canonicalUnit: "inventory::gloves_single",
		transform: identityTransform(),
		composable: false,
	});

	registry.registerUnit({
		id: "inventory::gloves_box_100",
		dimension: "discrete::nitrile_gloves",
		canonicalUnit: "inventory::gloves_single",
		transform: multiplicativeTransform(100),
		composable: false,
	});

	registry.registerUnit({
		id: "inventory::gloves_case_1000",
		dimension: "discrete::nitrile_gloves",
		canonicalUnit: "inventory::gloves_single",
		transform: multiplicativeTransform(1000),
		composable: false,
	});

	// Fastfood Happy Meal dimension
	registry.registerUnit({
		id: "fastfood::happy_meal",
		dimension: "discrete::happy_meal",
		canonicalUnit: "fastfood::happy_meal",
		transform: identityTransform(),
		composable: false,
	});

	// Time units for compound rates
	registry.registerUnit({
		id: "d",
		dimension: "time",
		canonicalUnit: "s",
		transform: multiplicativeTransform(86400),
		composable: true,
	});

	const baseConfig: QuantityGrammarConfig = {
		conversionRegistry: registry,
		packagingClassifiers: {
			order: ["order", "orders", "pedido", "pedidos", "commande", "commandes"],
			box: ["box", "boxes", "caja", "cajas", "boîte", "boîtes", "箱"],
			bottle: ["bottle", "bottles", "bouteille", "瓶"],
			piece: ["piece", "pieces", "件", "個", "个"],
			portion: ["portion", "portions", "份"],
		},
		fillerConnectors: ["of", "de", "d'", "von", "的"],
		unitAliases: {
			"inventory::gloves_box_100": [
				"boxes of nitrile gloves",
				"box of nitrile gloves",
				"cajas de guantes",
			],
			"inventory::gloves_single": [
				"nitrile gloves",
				"nitrile glove",
				"guantes",
			],
			"fastfood::happy_meal": [
				"happy meal",
				"happy meals",
				"repas joyeux",
				"儿童套餐",
			],
			d: ["day", "days", "d", "jour", "jours", "天", "日"],
		},
		operatorConfig: {
			operators: {
				greater_equal: [">=", "at least", "au moins", "al menos", "至少"],
				less_equal: ["<=", "at most", "au plus", "como maximo", "最多"],
				approximate: ["~", "about", "approx", "environ", "约"],
			},
		},
		statisticalConfig: {
			qualifiers: {
				standard_deviation: ["sd", "std dev", "écart type"],
				mean: ["mean", "moyenne", "promedio"],
			},
		},
		rangeDelimiters: ["to", "until", "a", "à", "bis", "-", "至", "到"],
		descendingDelimiters: ["down to", "herunter auf", "descendiendo a"],
	};

	describe("1. Direct Concept Counts & Classifiers with Fillers", () => {
		test("parses direct concept count with no classifier (e.g. '3 t-shirts')", () => {
			const res = parseQuantity("3 t-shirts", baseConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(3);
			expect(res.value?.primaryQuantity.unit).toBe("t-shirts");
			expect(res.value?.primaryQuantity.conceptDetails?.conceptTerm).toBe(
				"t-shirts",
			);
		});

		test("parses packaging classifier with filler word (e.g. '2 orders of happy meal')", () => {
			const res = parseQuantity("2 orders of happy meal", baseConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(2);
			expect(res.value?.primaryQuantity.unit).toBe("fastfood::happy_meal");
			expect(res.value?.primaryQuantity.conceptDetails).toEqual({
				conceptTerm: "happy meal",
				packagingUnit: "order",
				fillerConnector: "of",
			});
		});

		test("parses packaging classifier mapping to registered concept unit (e.g. '5 boxes of nitrile gloves')", () => {
			const res = parseQuantity("5 boxes of nitrile gloves", baseConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(5);
			expect(res.value?.primaryQuantity.unit).toBe("inventory::gloves_box_100");
			expect(res.value?.primaryQuantity.canonicalMagnitude).toBe(500);
			expect(res.value?.primaryQuantity.canonicalUnit).toBe(
				"inventory::gloves_single",
			);
		});
	});

	describe("2. Multi-Lingual Classifiers & Connectors", () => {
		test("parses CJK measure words (e.g. '3件T恤' and '2份儿童套餐')", () => {
			const res1 = parseQuantity("3件T恤", baseConfig);
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.value?.primaryQuantity.magnitude).toBe(3);
			expect(res1.value?.primaryQuantity.unit).toBe("piece::T恤");
			expect(res1.value?.primaryQuantity.conceptDetails?.packagingUnit).toBe(
				"piece",
			);
			expect(res1.value?.primaryQuantity.conceptDetails?.conceptTerm).toBe(
				"T恤",
			);

			const res2 = parseQuantity("2份儿童套餐", baseConfig);
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.value?.primaryQuantity.magnitude).toBe(2);
			expect(res2.value?.primaryQuantity.unit).toBe("fastfood::happy_meal");
			expect(res2.value?.primaryQuantity.conceptDetails?.packagingUnit).toBe(
				"portion",
			);
			expect(res2.value?.primaryQuantity.conceptDetails?.conceptTerm).toBe(
				"儿童套餐",
			);
		});

		test("parses Spanish packaging phrases (e.g. '5 cajas de guantes')", () => {
			const res = parseQuantity("5 cajas de guantes", baseConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(5);
			expect(res.value?.primaryQuantity.unit).toBe("inventory::gloves_box_100");
			expect(res.value?.primaryQuantity.canonicalMagnitude).toBe(500);
			expect(res.value?.primaryQuantity.canonicalUnit).toBe(
				"inventory::gloves_single",
			);
		});

		test("parses French packaging phrases (e.g. '3 boîtes de gants')", () => {
			const res = parseQuantity("3 boîtes de gants", baseConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(3);
			expect(res.value?.primaryQuantity.conceptDetails?.packagingUnit).toBe(
				"box",
			);
			expect(res.value?.primaryQuantity.conceptDetails?.fillerConnector).toBe(
				"de",
			);
			expect(res.value?.primaryQuantity.conceptDetails?.conceptTerm).toBe(
				"gants",
			);
		});
	});

	describe("3. Operators & Statistical Qualifiers on Concept Counts", () => {
		test("extracts prefix operator on concept count (e.g. 'at least 5 boxes of gloves')", () => {
			const res = parseQuantity(
				"at least 5 boxes of nitrile gloves",
				baseConfig,
			);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.operator?.operator).toBe("greater_equal");
			expect(res.value?.primaryQuantity.magnitude).toBe(5);
			expect(res.value?.primaryQuantity.unit).toBe("inventory::gloves_box_100");
			expect(res.value?.primaryQuantity.canonicalMagnitude).toBe(500);
		});

		test("extracts statistical qualifier on concept count (e.g. '100 boxes of gloves (SD 5)')", () => {
			const res = parseQuantity(
				"100 boxes of nitrile gloves (SD 5)",
				baseConfig,
			);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(100);
			expect(res.value?.statisticalQualifier?.kind).toBe("standard_deviation");
			expect(res.value?.statisticalQualifier?.value).toBe(5);
		});
	});

	describe("4. Concept Ranges & Heterogeneous Conversions", () => {
		test("parses homogeneous concept range (e.g. '2 to 5 boxes of nitrile gloves')", () => {
			const res = parseQuantity("2 to 5 boxes of nitrile gloves", baseConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.start.magnitude).toBe(2);
			expect(res.value?.range?.end.magnitude).toBe(5);
			expect(res.value?.range?.start.canonicalMagnitude).toBe(200);
			expect(res.value?.range?.end.canonicalMagnitude).toBe(500);
		});

		test("parses heterogeneous pack-to-unit concept range (e.g. '1 box to 500 gloves')", () => {
			const configWithShortAliases: QuantityGrammarConfig = {
				...baseConfig,
				unitAliases: {
					...baseConfig.unitAliases,
					"inventory::gloves_box_100": ["box", "boxes"],
					"inventory::gloves_single": ["gloves", "glove"],
				},
			};

			const res = parseQuantity("1 box to 500 gloves", configWithShortAliases);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.isHeterogeneousUnits).toBe(true);
			expect(res.value?.range?.start.canonicalMagnitude).toBe(100);
			expect(res.value?.range?.end.canonicalMagnitude).toBe(500);
			expect(res.value?.range?.start.canonicalUnit).toBe(
				"inventory::gloves_single",
			);
			expect(res.value?.range?.end.canonicalUnit).toBe(
				"inventory::gloves_single",
			);
		});

		test("parses directional tapering concept range (e.g. '10 down to 2 boxes of nitrile gloves')", () => {
			const res = parseQuantity(
				"10 down to 2 boxes of nitrile gloves",
				baseConfig,
			);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.range?.direction).toBe("descending");
			expect(res.value?.range?.start.magnitude).toBe(10);
			expect(res.value?.range?.end.magnitude).toBe(2);
		});
	});

	describe("5. Compound Rates with Concepts", () => {
		test("parses compound rate with concept numerator (e.g. '10 boxes of gloves / day')", () => {
			const res = parseCompoundRate("10 boxes of nitrile gloves / day", {
				quantityConfig: { ...baseConfig, conversionRegistry: registry },
				rateDelimiters: ["/"],
			});
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value).toBeDefined();
			if (res.value?.numerator.type === "quantity") {
				expect(res.value.numerator.quantity.magnitude).toBe(10);
				expect(res.value.numerator.quantity.unit).toBe(
					"inventory::gloves_box_100",
				);
			}
			expect(res.value?.denominators[0]?.quantity?.unit).toBe("d");
		});
	});

	describe("6. Pluggable Concept Resolver Hooks (Sync & Async)", () => {
		test("synchronous conceptResolver attaches resolved canonical concept ID", () => {
			const syncConfig: QuantityGrammarConfig = {
				...baseConfig,
				conceptResolver: (term) => {
					if (term.toLowerCase().includes("aspirin")) {
						return {
							conceptId: "rxnorm::1191",
							canonicalTerm: "Aspirin Oral Tablet",
							standardCode: "1191",
						};
					}
					return undefined;
				},
			};

			const res = parseQuantity("10 bottles of aspirin", syncConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.magnitude).toBe(10);
			expect(res.value?.primaryQuantity.unit).toBe("rxnorm::1191");
			expect(res.value?.primaryQuantity.conceptDetails?.conceptId).toBe(
				"rxnorm::1191",
			);
			expect(res.value?.primaryQuantity.conceptDetails?.standardCode).toBe(
				"1191",
			);
		});

		test("asynchronous conceptResolver via resolveQuantityGrammarAsync resolves external ontology IDs", async () => {
			const asyncConfig: QuantityGrammarConfig = {
				...baseConfig,
				conceptResolver: async (term) => {
					await new Promise((resolve) => setTimeout(resolve, 20));
					if (term.toLowerCase().includes("metformin")) {
						return {
							conceptId: "rxnorm::866514",
							canonicalTerm: "Metformin Hydrochloride 500mg",
						};
					}
					return undefined;
				},
			};

			const initial = parseQuantity("2 bottles of metformin", asyncConfig);
			expect(initial.value?.primaryQuantity.conceptDetails?.conceptTerm).toBe(
				"metformin",
			);

			const resolved = await resolveQuantityGrammarAsync(
				initial.value!,
				asyncConfig,
			);
			expect(resolved.primaryQuantity.unit).toBe("rxnorm::866514");
			expect(resolved.primaryQuantity.conceptDetails?.conceptId).toBe(
				"rxnorm::866514",
			);
		});
	});

	describe("7. Consumer Policy Namespace Guards", () => {
		test("rejects unauthorized namespaces when allowedNamespaces policy is set", () => {
			const res = parseQuantity(
				"5 custom::item",
				{
					...baseConfig,
				},
				{
					allowedNamespaces: ["inventory", "rxnorm", "fastfood"],
				},
			);

			expect(res.diagnostics).toHaveLength(1);
			expect(res.diagnostics[0]?.code).toBe("namespace_disallowed");
		});

		test("accepts authorized namespaces matching allowedNamespaces policy", () => {
			const res = parseQuantity(
				"5 boxes of nitrile gloves",
				{
					...baseConfig,
				},
				{
					allowedNamespaces: ["inventory", "rxnorm", "fastfood"],
				},
			);

			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.primaryQuantity.unit).toBe("inventory::gloves_box_100");
		});
	});
});
