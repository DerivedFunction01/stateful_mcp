import type { FundamentalGroup, FundamentalPattern } from "../fundamentals";
import type { RecipeOutputBuilder, ValueRecipe } from "../recipes";
import type { DateTimeFormatRegistry } from "./format-config";

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
