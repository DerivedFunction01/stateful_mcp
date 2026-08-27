import { flattenAndSortAliases } from "../token-matcher";
import type { QuantityGrammarConfig, SingleQuantity } from "./contracts";

/**
 * Resolves a unit token against user-configured unitAliases, returning the canonical UnitId
 */
export function resolveUnitAlias(
	unitToken: string,
	aliases?: Readonly<Record<string, readonly string[]>>,
	locales?: string | readonly string[],
	fallbackToLiteral = false,
): { canonicalUnit: string; matchedAlias: string } | undefined {
	const trimmed = unitToken.trim();
	if (!trimmed) return undefined;

	if (!aliases) {
		return fallbackToLiteral
			? { canonicalUnit: trimmed, matchedAlias: trimmed }
			: undefined;
	}

	const lower = trimmed.toLocaleLowerCase(locales as string);
	const sorted = flattenAndSortAliases(aliases, true);
	for (const { key, alias } of sorted) {
		if (alias.toLocaleLowerCase(locales as string) === lower) {
			return { canonicalUnit: key, matchedAlias: alias };
		}
	}

	return fallbackToLiteral
		? { canonicalUnit: trimmed, matchedAlias: trimmed }
		: undefined;
}

/** Constructs one quantity from already-bounded, terminal-parsed slots. */
export function createSingleQuantity(
	magnitude: number,
	unitToken: string,
	config: Pick<
		QuantityGrammarConfig,
		"unitAliases" | "locales" | "conversionRegistry"
	> = {},
	rawText: string,
): SingleQuantity | undefined {
	if (!Number.isFinite(magnitude)) return undefined;
	const resolved = resolveUnitAlias(
		unitToken,
		config.unitAliases,
		config.locales,
		Object.keys(config.unitAliases ?? {}).length === 0,
	);
	if (!resolved) return undefined;
	const quantity: SingleQuantity = {
		magnitude,
		unit: resolved.canonicalUnit,
		rawText: rawText.trim(),
	};
	const canonical = config.conversionRegistry?.convertToCanonicalByUnit(
		resolved.canonicalUnit,
		magnitude,
	);
	return canonical
		? {
				...quantity,
				canonicalUnit: canonical.canonicalUnit,
				canonicalMagnitude: canonical.canonicalAmount,
			}
		: quantity;
}
