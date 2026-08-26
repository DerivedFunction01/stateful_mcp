import type { CompiledArgumentPolicy } from "../../src/contracts/extension-config";
import type {
	CurrencyFormatConfig,
	CurrencyGrammarResult,
} from "../../src/values/currency";
import type { DateTimeFormatRegistry } from "../../src/values/date-time";
import type {
	CadenceSchedule,
	FrequencyGrammarConfig,
} from "../../src/values/frequency";
import type {
	FundamentalGroup,
	FundamentalPattern,
} from "../../src/values/fundamentals";
import type { QuantityGrammarResult } from "../../src/values/quantity";
import type {
	CompoundRateConfig,
	CompoundRateValue,
} from "../../src/values/rates";
import type {
	RecipeEvaluation,
	RecipeOutputBuilder,
	ValueRecipe,
} from "../../src/values/recipes";
import { escapeRegex } from "../../src/values/regex";

/** Explicit, opt-in definitions supplied by a built-in recipe factory. */
export interface BuiltinRecipeSet {
	readonly fundamentals: readonly FundamentalGroup[];
	readonly recipes: readonly ValueRecipe[];
	readonly outputBuilders: Readonly<Record<string, RecipeOutputBuilder>>;
}

/** Creates finite, explicitly enabled rate recipes. */
export function createRateRecipeSet(
	config: CompoundRateConfig,
): BuiltinRecipeSet {
	const delimiters = config.rateDelimiters ?? [];
	if (!delimiters.length)
		return { fundamentals: [], recipes: [], outputBuilders: {} };
	const delimiterPatterns = delimiters.map((text, index) => ({
		id: `rate-delimiter-${index}`,
		text,
		boundary: "none" as const,
		caseSensitive: false,
	}));
	const group: FundamentalGroup = {
		id: "rate.single-denominator",
		variants: [
			{
				id: "quantity-quantity",
				slots: [
					{ id: "numerator", pattern: ".+" },
					{ id: "denominator", pattern: ".+" },
				],
				connectors: [delimiterPatterns],
			},
			{
				id: "quantity-quantity-quantity",
				slots: [
					{ id: "numerator", pattern: ".+" },
					{ id: "denominator", pattern: ".+" },
					{ id: "denominator2", pattern: ".+" },
				],
				connectors: [delimiterPatterns, delimiterPatterns],
			},
		],
	};
	const root = (
		numerator: string,
		variantId: string,
		chain = false,
	): ValueRecipe["root"] => ({
		kind: "fundamental",
		groupId: group.id,
		variantIds: [variantId],
		children: [
			{ kind: "terminal", consumerId: numerator },
			{ kind: "terminal", consumerId: "rate-denominator" },
			...(chain
				? [{ kind: "terminal" as const, consumerId: "rate-denominator" }]
				: []),
		],
	});
	const build = (
		input: string,
		evaluation: RecipeEvaluation,
	): CompoundRateValue | undefined => {
		if (evaluation.kind !== "fundamental") return undefined;
		const numerator = slotValue(evaluation, "numerator");
		const denominatorValues = ["denominator", "denominator2"]
			.map(
				(slot) =>
					slotValue(evaluation, slot) as QuantityGrammarResult | undefined,
			)
			.filter((value): value is QuantityGrammarResult =>
				Boolean(value?.primaryQuantity),
			);
		if (denominatorValues.length === 0) return undefined;
		const denominators = denominatorValues.map((denominator) => ({
			unit: denominator.primaryQuantity!.unit,
			magnitude: denominator.primaryQuantity!.magnitude,
			quantity: denominator.primaryQuantity!,
			rawText: denominator.rawText,
		}));
		if (
			numerator &&
			typeof numerator === "object" &&
			"primaryQuantity" in numerator
		) {
			return {
				kind: "rate",
				numerator: {
					type: "quantity",
					quantity: (numerator as QuantityGrammarResult).primaryQuantity!,
				},
				denominators,
				rawText: input.trim(),
			};
		}
		if (numerator && typeof numerator === "object" && "currency" in numerator) {
			return {
				kind: "rate",
				numerator: {
					type: "currency",
					currency: numerator as CurrencyGrammarResult,
				},
				denominators,
				rawText: input.trim(),
			};
		}
		return undefined;
	};
	const rateAllowed = (
		value: CompoundRateValue,
		policy: Partial<CompiledArgumentPolicy> | undefined,
	) =>
		policy?.rateConsumerPolicy?.maxDenominators === undefined ||
		value.denominators.length <= policy.rateConsumerPolicy.maxDenominators;
	return {
		fundamentals: [group],
		recipes: [
			{
				id: "rate.quantity",
				root: root("quantity", "quantity-quantity"),
				outputBuilderId: "rate.quantity",
			},
			{
				id: "rate.quantity-chain",
				root: root("quantity", "quantity-quantity-quantity", true),
				outputBuilderId: "rate.quantity-chain",
			},
			{
				id: "rate.currency",
				root: root("currency", "quantity-quantity"),
				outputBuilderId: "rate.currency",
			},
			{
				id: "rate.currency-chain",
				root: root("currency", "quantity-quantity-quantity", true),
				outputBuilderId: "rate.currency-chain",
			},
		],
		outputBuilders: {
			"rate.quantity": ({ input, evaluation, policy }) => {
				const value = build(input, evaluation);
				return value?.numerator.type === "quantity" &&
					rateAllowed(value, policy)
					? { valid: true, value, displayValue: input.trim() }
					: { valid: false };
			},
			"rate.quantity-chain": ({ input, evaluation, policy }) => {
				const value = build(input, evaluation);
				return value?.numerator.type === "quantity" &&
					value.denominators.length === 2 &&
					rateAllowed(value, policy)
					? { valid: true, value, displayValue: input.trim() }
					: { valid: false };
			},
			"rate.currency": ({ input, evaluation, policy }) => {
				const value = build(input, evaluation);
				return value?.numerator.type === "currency" &&
					rateAllowed(value, policy)
					? { valid: true, value, displayValue: input.trim() }
					: { valid: false };
			},
			"rate.currency-chain": ({ input, evaluation, policy }) => {
				const value = build(input, evaluation);
				return value?.numerator.type === "currency" &&
					value.denominators.length === 2 &&
					rateAllowed(value, policy)
					? { valid: true, value, displayValue: input.trim() }
					: { valid: false };
			},
		},
	};
}

function literal(id: string, text: string): FundamentalPattern {
	return { id, text, caseSensitive: false };
}

function aliases(
	prefix: string,
	values: readonly string[],
): FundamentalPattern[] {
	return values.map((text, index) => literal(`${prefix}-${index}`, text));
}

function aliasValues(
	values: Readonly<Record<string, readonly string[]>> | undefined,
): readonly string[] {
	return Object.values(values ?? {}).flat();
}

function slotValue(
	evaluation: RecipeEvaluation | undefined,
	slotId: string,
): unknown {
	if (!evaluation || evaluation.kind !== "fundamental") return undefined;
	return evaluation.slots[slotId]?.kind === "terminal"
		? evaluation.slots[slotId].value
		: undefined;
}

/**
 * Builds explicit frequency syntax from the configured vocabulary. The
 * factory does not register or activate anything by itself.
 */
export function createFrequencyRecipeSet(
	config: FrequencyGrammarConfig,
): BuiltinRecipeSet {
	const groups: FundamentalGroup[] = [];
	const recipes: ValueRecipe[] = [];

	const intervalPrefixes = config.intervalPrefixes ?? [];
	const units = aliasValues(config.timeUnitAliases);
	const countAliases = aliasValues(config.multiplierAliases);
	const unitPattern = `(?:${units.map(escapeRegex).join("|")})`;
	const countPattern = [
		"[\\p{N}]+(?:[.,][\\p{N}]+)?",
		...countAliases.map(escapeRegex),
	].join("|");
	const configuredPattern = (values: readonly string[]) =>
		`(?:${values.map(escapeRegex).join("|")})`;
	if (intervalPrefixes.length && units.length) {
		groups.push({
			id: "frequency.interval",
			variants: [
				{
					id: "prefix-count-unit",
					prefix: aliases("interval-prefix", intervalPrefixes),
					slots: [
						{ id: "count", pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
						{ id: "unit", pattern: unitPattern },
					],
					connectors: [
						[
							{
								id: "slot-separator",
								text: " ",
								boundary: "none" as const,
								caseSensitive: false,
							},
						],
					],
				},
				...(config.rangeComponents?.length
					? [
							{
								id: "prefix-count-range-unit",
								prefix: aliases("interval-prefix", intervalPrefixes),
								slots: [
									{ id: "lower", pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
									{ id: "upper", pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
									{ id: "unit", pattern: unitPattern },
								],
								connectors: [
									config.rangeComponents[0]!.connector.map((pattern) => ({
										...pattern,
										caseSensitive: pattern.caseSensitive ?? false,
									})),
									[
										{
											id: "range-space",
											text: " ",
											boundary: "none" as const,
											caseSensitive: false,
										},
									],
								],
							},
						]
					: []),
			],
		});
		recipes.push({
			id: "frequency.interval",
			root: {
				kind: "fundamental",
				groupId: "frequency.interval",
				variantIds: ["prefix-count-unit"],
				children: [
					{ kind: "terminal", consumerId: "frequency-count" },
					{ kind: "terminal", consumerId: "frequency-unit" },
				],
			},
			outputBuilderId: "frequency.interval",
		});
		if (config.rangeComponents?.length) {
			recipes.push({
				id: "frequency.interval-range",
				root: {
					kind: "fundamental",
					groupId: "frequency.interval",
					variantIds: ["prefix-count-range-unit"],
					children: [
						{ kind: "terminal", consumerId: "frequency-count" },
						{ kind: "terminal", consumerId: "frequency-count" },
						{ kind: "terminal", consumerId: "frequency-unit" },
					],
				},
				outputBuilderId: "frequency.interval-range",
			});
		}
	}

	const recurrenceConnectors = config.recurrenceConnectors ?? [];
	if (recurrenceConnectors.length && units.length) {
		groups.push({
			id: "frequency.recurrence",
			variants: [
				{
					id: "count-connector-period",
					slots: [
						{ id: "count", pattern: countPattern },
						{ id: "period", pattern: unitPattern },
					],
					connectors: [aliases("recurrence-connector", recurrenceConnectors)],
				},
			],
		});
		recipes.push({
			id: "frequency.recurrence",
			root: {
				kind: "fundamental",
				groupId: "frequency.recurrence",
				children: [
					{ kind: "terminal", consumerId: "frequency-count" },
					{ kind: "terminal", consumerId: "frequency-unit" },
				],
			},
			outputBuilderId: "frequency.recurrence",
		});
	}

	const conditionalAliases = config.conditionalAliases ?? [];
	const conditionConnectors = config.conditionConnectors ?? [];
	if (conditionalAliases.length && conditionConnectors.length) {
		groups.push({
			id: "frequency.conditional",
			variants: [
				{
					id: "marker-condition",
					slots: [
						{ id: "marker", pattern: configuredPattern(conditionalAliases) },
						{ id: "condition", pattern: ".+" },
					],
					connectors: [aliases("condition-connector", conditionConnectors)],
				},
			],
		});
		recipes.push({
			id: "frequency.conditional",
			root: {
				kind: "fundamental",
				groupId: "frequency.conditional",
				children: [
					{ kind: "terminal", consumerId: "text" },
					{ kind: "terminal", consumerId: "text" },
				],
			},
			outputBuilderId: "frequency.conditional",
		});
	}

	if (config.frequencyAliases && Object.keys(config.frequencyAliases).length) {
		recipes.push({
			id: "frequency.alias",
			root: { kind: "terminal", consumerId: "frequency-alias" },
		});
	}

	const anchorEntries = Object.entries(config.eventAnchorAliases ?? {});
	const anchorAliases = anchorEntries.flatMap(([, values]) => values);
	const offsetEntries = Object.entries(
		config.relativeOffsetConnectors ?? {},
	) as Array<["before" | "after" | "at" | "with", readonly string[]]>;
	const offsetAliases = offsetEntries.flatMap(([, values]) => values);
	if (anchorAliases.length) {
		groups.push({
			id: "frequency.event-anchor",
			variants: [
				{
					id: "anchor",
					slots: [{ id: "anchor", pattern: configuredPattern(anchorAliases) }],
				},
			],
		});
		recipes.push({
			id: "frequency.event-anchor",
			root: {
				kind: "fundamental",
				groupId: "frequency.event-anchor",
				children: [{ kind: "terminal", consumerId: "frequency-anchor" }],
			},
			outputBuilderId: "frequency.event-anchor",
		});
	}
	if (anchorAliases.length && units.length && offsetAliases.length) {
		groups.push({
			id: "frequency.event-offset",
			variants: [
				{
					id: "duration-direction-anchor",
					slots: [
						{ id: "magnitude", pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
						{ id: "unit", pattern: unitPattern },
						{ id: "direction", pattern: configuredPattern(offsetAliases) },
						{ id: "anchor", pattern: configuredPattern(anchorAliases) },
					],
					connectors: [
						[
							{
								id: "space-1",
								text: " ",
								boundary: "none",
								caseSensitive: false,
							},
						],
						[
							{
								id: "space-2",
								text: " ",
								boundary: "none",
								caseSensitive: false,
							},
						],
						[
							{
								id: "space-3",
								text: " ",
								boundary: "none",
								caseSensitive: false,
							},
						],
					],
				},
			],
		});
		recipes.push({
			id: "frequency.event-offset",
			root: {
				kind: "fundamental",
				groupId: "frequency.event-offset",
				children: [
					{ kind: "terminal", consumerId: "frequency-count" },
					{ kind: "terminal", consumerId: "frequency-unit" },
					{ kind: "terminal", consumerId: "frequency-direction" },
					{ kind: "terminal", consumerId: "frequency-anchor" },
				],
			},
			outputBuilderId: "frequency.event-offset",
		});
	}
	const builders: Record<string, RecipeOutputBuilder> = {
		"frequency.interval": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const count = slotValue(evaluation, "count");
			const unit = slotValue(evaluation, "unit");
			if (typeof count !== "number" || typeof unit !== "string")
				return { valid: false };
			const frequencyPolicy = policy?.frequencyConsumerPolicy;
			if (
				frequencyPolicy?.allowedCadenceTypes &&
				!frequencyPolicy.allowedCadenceTypes.includes("interval")
			)
				return { valid: false };
			if (
				frequencyPolicy?.allowedUnits &&
				!frequencyPolicy.allowedUnits.includes(unit)
			)
				return { valid: false };
			const value: CadenceSchedule = {
				cadenceType: "interval",
				interval: { multiplier: count, unit },
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"frequency.interval-range": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const lower = slotValue(evaluation, "lower");
			const upper = slotValue(evaluation, "upper");
			const unit = slotValue(evaluation, "unit");
			const frequencyPolicy = policy?.frequencyConsumerPolicy;
			if (
				typeof lower !== "number" ||
				typeof upper !== "number" ||
				typeof unit !== "string" ||
				(frequencyPolicy?.allowedCadenceTypes &&
					!frequencyPolicy.allowedCadenceTypes.includes("interval")) ||
				(frequencyPolicy?.allowedUnits &&
					!frequencyPolicy.allowedUnits.includes(unit))
			)
				return { valid: false };
			const value: CadenceSchedule = {
				cadenceType: "interval",
				interval: { multiplier: lower, upperMultiplier: upper, unit },
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"frequency.recurrence": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const count = slotValue(evaluation, "count");
			const period = slotValue(evaluation, "period");
			if (typeof count !== "number" || typeof period !== "string")
				return { valid: false };
			const frequencyPolicy = policy?.frequencyConsumerPolicy;
			if (
				frequencyPolicy?.allowedCadenceTypes &&
				!frequencyPolicy.allowedCadenceTypes.includes("recurrence")
			)
				return { valid: false };
			if (
				frequencyPolicy?.allowedUnits &&
				!frequencyPolicy.allowedUnits.includes(period)
			)
				return { valid: false };
			const value: CadenceSchedule = {
				cadenceType: "recurrence",
				recurrence: { count, period },
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"frequency.event-anchor": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const anchor = slotValue(evaluation, "anchor");
			const frequencyPolicy = policy?.frequencyConsumerPolicy;
			if (
				typeof anchor !== "string" ||
				(frequencyPolicy?.allowedCadenceTypes &&
					!frequencyPolicy.allowedCadenceTypes.includes("event_anchored")) ||
				(frequencyPolicy?.allowedAnchors &&
					!frequencyPolicy.allowedAnchors.includes(anchor))
			)
				return { valid: false };
			const value: CadenceSchedule = {
				cadenceType: "event_anchored",
				eventAnchor: anchor,
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"frequency.conditional": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const condition = slotValue(evaluation, "condition");
			if (
				typeof condition !== "string" ||
				policy?.frequencyConsumerPolicy?.allowConditional === false ||
				(policy?.frequencyConsumerPolicy?.allowedCadenceTypes &&
					!policy.frequencyConsumerPolicy.allowedCadenceTypes.includes(
						"one_time",
					))
			)
				return { valid: false };
			const value: CadenceSchedule = {
				cadenceType: "one_time",
				isConditional: true,
				condition,
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
		"frequency.event-offset": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const magnitude = slotValue(evaluation, "magnitude");
			const unit = slotValue(evaluation, "unit");
			const direction = slotValue(evaluation, "direction");
			const anchor = slotValue(evaluation, "anchor");
			const frequencyPolicy = policy?.frequencyConsumerPolicy;
			if (
				typeof magnitude !== "number" ||
				typeof unit !== "string" ||
				typeof direction !== "string" ||
				typeof anchor !== "string" ||
				!(["before", "after", "at", "with"] as const).includes(
					direction as "before" | "after" | "at" | "with",
				) ||
				(frequencyPolicy?.allowedCadenceTypes &&
					!frequencyPolicy.allowedCadenceTypes.includes("event_anchored")) ||
				(frequencyPolicy?.allowedAnchors &&
					!frequencyPolicy.allowedAnchors.includes(anchor)) ||
				(frequencyPolicy?.allowedUnits &&
					!frequencyPolicy.allowedUnits.includes(unit))
			)
				return { valid: false };
			const value: CadenceSchedule = {
				cadenceType: "event_anchored",
				eventAnchor: anchor,
				relativeOffset: {
					direction: direction as "before" | "after" | "at" | "with",
					duration: { magnitude, unit },
				},
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		},
	};

	return { fundamentals: groups, recipes, outputBuilders: builders };
}

/** Utility for callers composing multiple explicit built-in recipe sets. */
export function combineBuiltinRecipeSets(
	...sets: readonly BuiltinRecipeSet[]
): BuiltinRecipeSet {
	return {
		fundamentals: sets.flatMap((set) => set.fundamentals),
		recipes: sets.flatMap((set) => set.recipes),
		outputBuilders: Object.assign({}, ...sets.map((set) => set.outputBuilders)),
	};
}

/**
 * Creates explicit currency recipes from configured symbols and codes.
 * Each variant is a separate, bounded form rather than a generic recognizer.
 */
export function createCurrencyRecipeSet(
	config: CurrencyFormatConfig,
): BuiltinRecipeSet {
	const markerTexts: string[] = [];
	for (const definition of config.definitions ?? []) {
		for (const symbol of definition.symbols ?? []) markerTexts.push(symbol);
		markerTexts.push(definition.code);
	}
	for (const [code, aliases] of Object.entries(
		config.currencies ?? ({} as Record<string, readonly string[]>),
	)) {
		markerTexts.push(code);
		for (const alias of aliases) markerTexts.push(alias);
	}
	if (markerTexts.length === 0)
		return { fundamentals: [], recipes: [], outputBuilders: {} };
	const position = config.position ?? "both";
	const amountPattern = "[\\p{N}]+(?:[.,][\\p{N}]+)?";
	const markerPattern = `(?:${[...new Set(markerTexts)].map(escapeRegex).join("|")})`;
	const groups: FundamentalGroup[] = [];
	const recipes: ValueRecipe[] = [];
	if (position === "prefix" || position === "both") {
		groups.push({
			id: "currency.prefix",
			variants: [
				{
					id: "marker-amount",
					slots: [
						{ id: "marker", pattern: markerPattern },
						{ id: "amount", pattern: amountPattern },
					],
					connectors: [
						[{ id: "currency-empty", text: "", boundary: "none" as const }],
					],
				},
			],
		});
		recipes.push({
			id: "currency.prefix",
			root: {
				kind: "fundamental",
				groupId: "currency.prefix",
				children: [
					{ kind: "terminal", consumerId: "currency-marker" },
					{ kind: "terminal", consumerId: "currency-amount" },
				],
			},
			outputBuilderId: "currency.prefix",
		});
	}
	if (position === "suffix" || position === "both") {
		groups.push({
			id: "currency.suffix",
			variants: [
				{
					id: "amount-marker",
					slots: [
						{ id: "amount", pattern: amountPattern },
						{ id: "marker", pattern: markerPattern },
					],
					connectors: [
						[{ id: "currency-empty", text: "", boundary: "none" as const }],
					],
				},
			],
		});
		recipes.push({
			id: "currency.suffix",
			root: {
				kind: "fundamental",
				groupId: "currency.suffix",
				children: [
					{ kind: "terminal", consumerId: "currency-amount" },
					{ kind: "terminal", consumerId: "currency-marker" },
				],
			},
			outputBuilderId: "currency.suffix",
		});
	}
	const builders: Record<string, RecipeOutputBuilder> = {};
	for (const recipeId of ["currency.prefix", "currency.suffix"]) {
		builders[recipeId] = ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const marker = slotValue(evaluation, "marker") as
				| { code: string; symbol: string }
				| undefined;
			const amount = slotValue(evaluation, "amount");
			if (!marker || typeof amount !== "number") return { valid: false };
			const currencyPolicy = policy?.currencyConsumerPolicy;
			if (
				currencyPolicy?.allowedCurrencies &&
				!currencyPolicy.allowedCurrencies.includes(marker.code)
			) {
				return { valid: false };
			}
			if (currencyPolicy?.allowNegative === false && amount < 0) {
				return { valid: false };
			}
			const value: CurrencyGrammarResult = {
				amount,
				currency: marker.code,
				symbol: marker.symbol,
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		};
	}
	return { fundamentals: groups, recipes, outputBuilders: builders };
}

/**
 * Creates explicit date-time recipes from a configured registry.
 * Each format variant becomes a separate, bounded recipe.
 */
export function createDateTimeRecipeSet(
	registry: DateTimeFormatRegistry,
): BuiltinRecipeSet {
	const groups: FundamentalGroup[] = [];
	const recipes: ValueRecipe[] = [];
	const builders: Record<string, RecipeOutputBuilder> = {};
	for (const [formatId, format] of Object.entries(registry.formats)) {
		const patterns: FundamentalPattern[] = [];
		for (const token of format.tokens) {
			if (token === "YYYY" || token === "YY") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{N}]{${token === "YYYY" ? "4" : "2"}}`,
					boundary: "none" as const,
				});
			} else if (token === "MM" || token === "DD") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{N}]{1,2}`,
					boundary: "none" as const,
				});
			}
		}
		if (patterns.length === 0) continue;
		const separators = format.separators ?? [];
		const group: FundamentalGroup = {
			id: `date.${formatId}`,
			variants: [
				{
					id: formatId,
					slots: patterns,
					connectors: separators
						.slice(1, -1)
						.map((sep) => [
							{ id: `${formatId}-sep`, text: sep, boundary: "none" as const },
						]),
				},
			],
		};
		groups.push(group);
		recipes.push({
			id: `date.${formatId}`,
			root: {
				kind: "fundamental",
				groupId: group.id,
				children: format.tokens.map((token) => ({
					kind: "terminal" as const,
					consumerId:
						token === "YYYY" || token === "YY"
							? "date-year"
							: token === "MM"
								? "date-month"
								: token === "DD"
									? "date-day"
									: "text",
				})),
			},
			outputBuilderId: `date.${formatId}`,
		});
		builders[`date.${formatId}`] = ({ evaluation, input }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			return {
				valid: true,
				value: { rawText: input.trim() },
				displayValue: input.trim(),
			};
		};
	}
	return { fundamentals: groups, recipes, outputBuilders: builders };
}
