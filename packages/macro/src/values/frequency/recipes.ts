import type { FundamentalGroup, FundamentalPattern } from "../fundamentals";
import type { RecipeOutputBuilder, ValueRecipe } from "../recipes";
import { buildAliasAlternation, slotValue } from "../recipes/shared";
import { escapeRegex } from "../regex";
import type { CadenceSchedule, FrequencyGrammarConfig } from "./types";

/**
 * Explicit, opt-in definitions supplied by the frequency built-in recipe
 * factory. Mirrors the legacy {@link BuiltinRecipeSet} shape so callers can
 * compose multiple authored recipe sets without coupling to a single source.
 */
export interface FrequencyRecipeSet {
	readonly fundamentals: readonly FundamentalGroup[];
	readonly recipes: readonly ValueRecipe[];
	readonly outputBuilders: Readonly<Record<string, RecipeOutputBuilder>>;
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

function normalizePatterns(
	patterns: readonly FundamentalPattern[],
): FundamentalPattern[] {
	return patterns.map((pattern) => ({
		...pattern,
		caseSensitive: pattern.caseSensitive ?? false,
	}));
}

/**
 * Builds explicit frequency syntax from the configured vocabulary. The
 * factory does not register or activate anything by itself.
 */
export function createFrequencyRecipeSet(
	config: FrequencyGrammarConfig,
): FrequencyRecipeSet {
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
				...(config.rangeComponents ?? []).map((component) => ({
					id: `range-${component.id}`,
					prefix: normalizePatterns([
						...aliases("interval-prefix", intervalPrefixes),
						...(component.prefix ?? []),
					]),
					slots: [
						{ id: "lower", pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
						{ id: "upper", pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
						{ id: "unit", pattern: unitPattern },
					],
					connectors: [
						normalizePatterns(component.connector),
						normalizePatterns([
							{
								id: `range-space-${component.id}`,
								text: " ",
								boundary: "none" as const,
								caseSensitive: false,
							},
						]),
					],
					postfix: component.suffix
						? normalizePatterns(component.suffix)
						: undefined,
				})),
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
					variantIds: config.rangeComponents.map(
						(component) => `range-${component.id}`,
					),
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
						{
							id: "marker",
							pattern: buildAliasAlternation(conditionalAliases),
						},
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
					slots: [
						{ id: "anchor", pattern: buildAliasAlternation(anchorAliases) },
					],
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
						{ id: "direction", pattern: buildAliasAlternation(offsetAliases) },
						{ id: "anchor", pattern: buildAliasAlternation(anchorAliases) },
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
