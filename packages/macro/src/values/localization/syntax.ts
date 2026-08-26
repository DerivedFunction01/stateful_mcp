import type { LocalizationPolicyConfig } from "../../contracts/extension-config";

export function resolveQuotePairs(
	localization?: LocalizationPolicyConfig,
	syntaxQuoteCharacters?: readonly string[],
): Array<[open: string, close: string]> {
	if (localization?.quotePairs && localization.quotePairs.length > 0) {
		return localization.quotePairs.map(([o, c]) => [o, c]);
	}
	if (syntaxQuoteCharacters && syntaxQuoteCharacters.length > 0) {
		return syntaxQuoteCharacters.map((q) => [q, q]);
	}
	// Standard universal quote pairs: ASCII double/single, French/Russian guillemets, CJK corner brackets, typographic curly quotes
	return [
		['"', '"'],
		["'", "'"],
		["«", "»"],
		["“", "”"],
		["‘", "’"],
		["「", "」"],
		["『", "』"],
	];
}

export function resolveGroupBrackets(
	localization?: LocalizationPolicyConfig,
	groupOpen?: string,
	groupClose?: string,
): Array<[open: string, close: string]> {
	if (localization?.groupBrackets && localization.groupBrackets.length > 0) {
		return localization.groupBrackets.map(([o, c]) => [o, c]);
	}
	if (groupOpen && groupClose) {
		return [[groupOpen, groupClose]];
	}
	return [
		["(", ")"],
		["（", "）"],
		["[", "]"],
		["【", "】"],
	];
}
