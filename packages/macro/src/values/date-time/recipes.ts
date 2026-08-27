import type { FundamentalGroup, FundamentalPattern } from "../fundamentals";
import { parseNumericValue } from "../numeric";
import type {
	RecipeOutputBuilder,
	TerminalParser,
	ValueRecipe,
} from "../recipes";
import { result } from "../terminals/shared";
import type { BuiltinTerminalOptions } from "../terminals/types";
import {
	type DateTimeFormatRegistry,
	normalizeDateTimeFormatDefinition,
} from "./format-config";

/**
 * Explicit, opt-in definitions supplied by the date-time built-in recipe
 * factory. Mirrors the legacy {@link BuiltinRecipeSet} shape so callers can
 * compose multiple authored recipe sets without coupling to a single source.
 */
export interface DateTimeRecipeSet {
	readonly fundamentals: readonly FundamentalGroup[];
	readonly recipes: readonly ValueRecipe[];
	readonly outputBuilders: Readonly<Record<string, RecipeOutputBuilder>>;
}

/** Terminal consumers used by the authored date-time recipe graph. */
export function createDateTimeTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	return {
		"date-year": (_id, input) => {
			const parsed = parseNumericValue(input, {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-month": (_id, input) => {
			const parsed = parseNumericValue(input, {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-day": (_id, input) => {
			const parsed = parseNumericValue(input, {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-month-name": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).date;
			const monthNames = config?.options?.monthNames ?? [];
			const monthAliases = config?.options?.monthAliases ?? [];
			const locales = (request?.grammar ?? grammar).localization?.locale;
			const normalized = input.trim().toLocaleLowerCase(locales as string);
			for (let index = 0; index < monthNames.length; index += 1) {
				const names = [
					monthNames[index],
					...(monthAliases[index] ?? []),
				].filter((name): name is string => Boolean(name));
				if (
					names.some(
						(name) => name.toLocaleLowerCase(locales as string) === normalized,
					)
				)
					return result(index + 1, []);
			}
			return { valid: false, stable: true };
		},
	};
}

/**
 * Creates explicit date-time recipes from a configured registry.
 * Each format variant becomes a separate, bounded recipe that preserves the
 * current canonical behavior of `{ rawText }` for date recipes.
 */
export function createDateTimeRecipeSet(
	registry: DateTimeFormatRegistry,
): DateTimeRecipeSet {
	const groups: FundamentalGroup[] = [];
	const recipes: ValueRecipe[] = [];
	const builders: Record<string, RecipeOutputBuilder> = {};
	for (const [formatId, rawFormat] of Object.entries(registry.formats)) {
		const format = normalizeDateTimeFormatDefinition(rawFormat);
		const patterns: FundamentalPattern[] = [];
		for (const token of format.tokens ?? []) {
			if (token === "YYYY" || token === "YY") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{N}]{${token === "YYYY" ? "4" : "2"}}`,
					boundary: "none" as const,
				});
			} else if (token === "MM" || token === "DD" || token === "DDD") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{N}]{1,${token === "DDD" ? "3" : "2"}}`,
					boundary: "none" as const,
				});
			} else if (token === "HH" || token === "min" || token === "SS") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{N}]{1,2}`,
					boundary: "none" as const,
				});
			} else if (token === "MM_name" || token === "ampm") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{L}]+`,
					boundary: "none" as const,
				});
			} else if (token === "tz") {
				patterns.push({
					id: `${formatId}-${token}`,
					text: `[\\p{L}\\p{N}+-]+`,
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
				children: (format.tokens ?? []).map((token) => ({
					kind: "terminal" as const,
					consumerId:
						token === "YYYY" || token === "YY"
							? "date-year"
							: token === "MM"
								? "date-month"
								: token === "MM_name"
									? "date-month-name"
									: token === "DD" || token === "DDD"
										? "date-day"
										: token === "HH"
											? "number"
											: token === "min"
												? "number"
												: token === "SS"
													? "number"
													: "text",
				})),
			},
			...(format.parserPriority !== undefined
				? { priority: format.parserPriority }
				: {}),
			capability: {
				valueKind: "date-time",
				providedFields: format.fields,
			},
			outputBuilderId: `date.${formatId}`,
		});
		builders[`date.${formatId}`] = ({ evaluation, input }) => {
			if (evaluation.kind !== "fundamental") return { valid: false };
			const structuredFields: Record<string, unknown> = {
				rawText: input.trim(),
			};
			for (const [slotKey, slotEval] of Object.entries(evaluation.slots)) {
				if (slotEval.kind === "terminal" && slotEval.value !== undefined) {
					if (slotKey.endsWith("-YYYY") || slotKey.endsWith("-YY")) {
						structuredFields.year = slotEval.value;
					} else if (slotKey.endsWith("-MM") || slotKey.endsWith("-MM_name")) {
						structuredFields.month = slotEval.value;
					} else if (slotKey.endsWith("-DD") || slotKey.endsWith("-DDD")) {
						structuredFields.day = slotEval.value;
					} else if (slotKey.endsWith("-HH")) {
						structuredFields.hour = slotEval.value;
					} else if (slotKey.endsWith("-min")) {
						structuredFields.minute = slotEval.value;
					} else if (slotKey.endsWith("-SS")) {
						structuredFields.second = slotEval.value;
					} else if (slotKey.endsWith("-ampm")) {
						structuredFields.dayPeriod = slotEval.value;
					} else if (slotKey.endsWith("-tz")) {
						structuredFields.timeZone = slotEval.value;
					}
				}
			}
			return {
				valid: true,
				value: structuredFields,
				displayValue: input.trim(),
			};
		};
	}
	return { fundamentals: groups, recipes, outputBuilders: builders };
}
