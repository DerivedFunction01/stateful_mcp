import type { FundamentalGroup, FundamentalPattern } from "../fundamentals";
import { createFundamentalFromAuthoredFormat } from "../fundamentals";
import { buildNumericPatternString, parseNumericValue } from "../numeric";
import type {
	RecipeOutputBuilder,
	TerminalParser,
	ValueRecipe,
} from "../recipes";
import { buildAliasAlternation, slotValue } from "../recipes/shared";
import { escapeRegex } from "../regex";
import type { TemplateTokenSpec } from "../template-compiler";
import { result } from "../terminals/shared";
import type { BuiltinTerminalOptions } from "../terminals/types";
import {
	FREQUENCY_TOKENS,
	type FrequencyToken,
	parseFormatTemplate,
} from "../token-spec";
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

/** Terminal consumers used by the authored frequency recipe graph. */
export function createFrequencyTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	return {
		"frequency-count": (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const config = activeGrammar.frequency;
			const numeric = parseNumericValue(input, config?.numericConfig);
			if (numeric.parsed)
				return result(numeric.parsed.value, numeric.diagnostics);
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [count, aliases] of Object.entries(
				config?.multiplierAliases ?? {},
			)) {
				if (
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					)
				)
					return result(Number(count), []);
			}
			return result(undefined, numeric.diagnostics);
		},
		"frequency-unit": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [unit, aliases] of Object.entries(
				config?.timeUnitAliases ?? {},
			)) {
				if (
					unit.toLocaleLowerCase(config?.locales as string) === normalized ||
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					)
				)
					return result(unit, []);
			}
			return { valid: false, stable: true };
		},
		"frequency-alias": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [alias, schedule] of Object.entries(
				config?.frequencyAliases ?? {},
			)) {
				if (alias.toLocaleLowerCase(config?.locales as string) === normalized)
					return result({ ...schedule, rawText: input.trim() }, []);
			}
			return { valid: false, stable: true };
		},
		"frequency-anchor": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [anchor, aliases] of Object.entries(
				config?.eventAnchorAliases ?? {},
			)) {
				if (
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					) ||
					anchor.toLocaleLowerCase(config?.locales as string) === normalized
				)
					return result(anchor, []);
			}
			return { valid: false, stable: true };
		},
		"frequency-direction": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [direction, aliases] of Object.entries(
				config?.relativeOffsetConnectors ?? {},
			)) {
				if (
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					)
				)
					return result(direction, []);
			}
			return { valid: false, stable: true };
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
	const templateTokenConsumers: Readonly<Record<FrequencyToken, string>> = {
		INTERVAL_PREFIX: "text",
		INTERVAL_MAG: "frequency-count",
		INTERVAL_HIGH: "frequency-count",
		INTERVAL_UNIT: "frequency-unit",
		RECURRENCE_COUNT: "frequency-count",
		RECURRENCE_CONN: "text",
		PERIOD: "frequency-unit",
		OFFSET_MAG: "frequency-count",
		OFFSET_UNIT: "frequency-unit",
		OFFSET_DIR: "frequency-direction",
		ANCHOR: "frequency-anchor",
		PRN_TRIGGER: "text",
		CONDITION: "text",
	};
	const templateTokenSpecs: Readonly<
		Record<FrequencyToken, TemplateTokenSpec>
	> = {
		INTERVAL_PREFIX: {
			pattern: buildAliasAlternation(config.intervalPrefixes),
		},
		INTERVAL_MAG: { pattern: buildNumericPatternString(config.numericConfig) },
		INTERVAL_HIGH: { pattern: buildNumericPatternString(config.numericConfig) },
		INTERVAL_UNIT: {
			pattern: buildAliasAlternation(aliasValues(config.timeUnitAliases)),
		},
		RECURRENCE_COUNT: {
			pattern: buildNumericPatternString(config.numericConfig),
		},
		RECURRENCE_CONN: {
			pattern: buildAliasAlternation(config.recurrenceConnectors),
		},
		PERIOD: {
			pattern: buildAliasAlternation(aliasValues(config.timeUnitAliases)),
		},
		OFFSET_MAG: { pattern: buildNumericPatternString(config.numericConfig) },
		OFFSET_UNIT: {
			pattern: buildAliasAlternation(aliasValues(config.timeUnitAliases)),
		},
		OFFSET_DIR: {
			pattern: buildAliasAlternation(
				aliasValues(config.relativeOffsetConnectors),
			),
		},
		ANCHOR: {
			pattern: buildAliasAlternation(aliasValues(config.eventAnchorAliases)),
		},
		PRN_TRIGGER: { pattern: buildAliasAlternation(config.conditionalAliases) },
		CONDITION: { pattern: ".+?" },
	};
	for (const [index, template] of (config.templates ?? []).entries()) {
		const format =
			typeof template === "string"
				? parseFormatTemplate(template, FREQUENCY_TOKENS)
				: template;
		if (format.tokens.length === 0) continue;
		const id = `frequency.template.${format.id ?? index}`;
		groups.push(
			createFundamentalFromAuthoredFormat(id, format, templateTokenSpecs),
		);
		recipes.push({
			id,
			root: {
				kind: "fundamental",
				groupId: id,
				children: format.tokens.map((token) => ({
					kind: "terminal" as const,
					consumerId: templateTokenConsumers[token],
				})),
			},
			outputBuilderId: "frequency.template",
		});
	}

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
		"frequency.template": ({ evaluation, input, policy }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const count =
				slotValue(evaluation, "INTERVAL_MAG") ??
				slotValue(evaluation, "RECURRENCE_COUNT");
			const unit =
				slotValue(evaluation, "INTERVAL_UNIT") ??
				slotValue(evaluation, "PERIOD");
			const anchor = slotValue(evaluation, "ANCHOR");
			const direction = slotValue(evaluation, "OFFSET_DIR");
			const offsetMagnitude = slotValue(evaluation, "OFFSET_MAG");
			const offsetUnit = slotValue(evaluation, "OFFSET_UNIT");
			const condition = slotValue(evaluation, "CONDITION");
			const frequencyPolicy = policy?.frequencyConsumerPolicy;
			let value: CadenceSchedule | undefined;
			if (typeof anchor === "string") {
				if (
					frequencyPolicy?.allowedCadenceTypes &&
					!frequencyPolicy.allowedCadenceTypes.includes("event_anchored")
				)
					return { valid: false };
				value = {
					cadenceType: "event_anchored",
					eventAnchor: anchor,
					...(typeof direction === "string"
						? {
								relativeOffset: {
									direction: direction as "before" | "after" | "at" | "with",
									...(typeof offsetMagnitude === "number" &&
									typeof offsetUnit === "string"
										? {
												duration: {
													magnitude: offsetMagnitude,
													unit: offsetUnit,
												},
											}
										: {}),
								},
							}
						: {}),
					rawText: input.trim(),
				};
			} else if (typeof count === "number" && typeof unit === "string") {
				const recurrence =
					slotValue(evaluation, "RECURRENCE_COUNT") !== undefined;
				if (
					frequencyPolicy?.allowedCadenceTypes &&
					!frequencyPolicy.allowedCadenceTypes.includes(
						recurrence ? "recurrence" : "interval",
					)
				)
					return { valid: false };
				value = recurrence
					? {
							cadenceType: "recurrence",
							recurrence: { count, period: unit },
							rawText: input.trim(),
						}
					: {
							cadenceType: "interval",
							interval: { multiplier: count, unit },
							rawText: input.trim(),
						};
			} else if (typeof condition === "string") {
				if (frequencyPolicy?.allowConditional === false)
					return { valid: false };
				value = {
					cadenceType: "one_time",
					isConditional: true,
					condition,
					rawText: input.trim(),
				};
			}
			return value
				? { valid: true, value, displayValue: input.trim() }
				: { valid: false };
		},
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
