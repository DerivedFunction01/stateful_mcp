import { escapeRegex } from "../regex";
import { flattenAndSortAliases } from "../token-matcher";
import {
	type ExtractedOperatorResult,
	OPERATOR_INVERSIONS,
	type OperatorConfig,
	type OperatorMatch,
	type OperatorPosition,
} from "./types";

/**
 * Resolves a standalone token into a canonical OperatorKind using explicitly configured prefix or postfix aliases,
 * supporting user-defined negation prefixes (NEG_PREFIX) and negation postfixes (NEG_POSTFIX).
 */
export function resolveOperator(
	token: string,
	positionOrConfig: OperatorPosition | OperatorConfig = "prefix",
	maybeConfig?: OperatorConfig,
): OperatorMatch | undefined {
	const trimmed = token.trim();
	if (!trimmed) return undefined;

	const position: OperatorPosition =
		typeof positionOrConfig === "string" ? positionOrConfig : "prefix";
	const config: OperatorConfig =
		typeof positionOrConfig === "object"
			? positionOrConfig
			: (maybeConfig ?? {});

	const normalize = (value: string) =>
		config.caseSensitive
			? value
			: value.toLocaleLowerCase(config.locales as string);
	const lower = normalize(trimmed);

	const aliases =
		position === "prefix"
			? (config.prefixAliases ?? config.operators)
			: config.postfixAliases;
	if (!aliases) return undefined;

	// Flatten and sort all aliases by length descending
	const allPairs = flattenAndSortAliases(aliases, false);

	// 1. Direct Alias Match
	for (const { key: opKind, alias } of allPairs) {
		if (normalize(alias) === lower) {
			return {
				operator: opKind,
				position,
				rawText: trimmed,
				matchedAlias: alias,
			};
		}
	}

	// 2. Check for NEG_PREFIX (e.g. "not" + "more than" -> "less_equal")
	if (config.negationPrefixes) {
		for (const neg of config.negationPrefixes) {
			const negLower = neg.toLocaleLowerCase(config.locales as string);
			const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(neg);
			const prefixPattern = isSymbol
				? `^${escapeRegex(negLower)}\\s*`
				: `^${escapeRegex(negLower)}\\s+`;
			const negMatch = lower.match(new RegExp(prefixPattern, "iu"));
			if (negMatch) {
				const innerToken = lower.slice(negMatch[0].length).trim();
				for (const { key: opKind, alias } of allPairs) {
					if (
						alias.toLocaleLowerCase(config.locales as string) === innerToken
					) {
						return {
							operator: OPERATOR_INVERSIONS[opKind],
							position,
							rawText: trimmed,
							matchedAlias: alias,
							isInverted: true,
						};
					}
				}
			}
		}
	}

	// 3. Check for NEG_POSTFIX (e.g. "以上" + "ではない" -> "less")
	if (config.negationPostfixes) {
		for (const neg of config.negationPostfixes) {
			const negLower = neg.toLocaleLowerCase(config.locales as string);
			const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(neg);
			const postfixPattern = isSymbol
				? `\\s*${escapeRegex(negLower)}$`
				: `\\s*${escapeRegex(negLower)}$`;
			const negMatch = lower.match(new RegExp(postfixPattern, "iu"));
			if (negMatch && negMatch.index !== undefined) {
				const innerToken = lower.slice(0, negMatch.index).trim();
				for (const { key: opKind, alias } of allPairs) {
					if (
						alias.toLocaleLowerCase(config.locales as string) === innerToken
					) {
						return {
							operator: OPERATOR_INVERSIONS[opKind],
							position,
							rawText: trimmed,
							matchedAlias: alias,
							isInverted: true,
						};
					}
				}
			}
		}
	}

	return undefined;
}

/**
 * Extracts a prefix or postfix operator from a string, returning the OperatorMatch and the clean remainder.
 */
export function extractOperator(
	input: string,
	config: OperatorConfig = {},
): ExtractedOperatorResult {
	const text = input.trim();
	if (!text) return { remainderText: "" };

	// 1. Check configured Prefix Operators
	const prefixAliases = config.prefixAliases ?? config.operators;
	if (prefixAliases) {
		const allPrefix = flattenAndSortAliases(prefixAliases, false);

		// Check for user-defined NEG_PREFIX (e.g. "not", "no", "nicht")
		let negationPrefix: string | undefined;
		let textAfterNegation = text;
		if (config.negationPrefixes) {
			for (const neg of config.negationPrefixes) {
				const isNegSymbol = /^[^a-zA-Z0-9\s]+$/u.test(neg);
				const negPattern = isNegSymbol
					? `^${escapeRegex(neg)}\\s*`
					: `^${escapeRegex(neg)}(?![\\p{L}\\p{N}])\\s*`;
				const negRegex = new RegExp(negPattern, "iu");
				const negMatch = text.match(negRegex);
				if (negMatch) {
					negationPrefix = negMatch[0];
					textAfterNegation = text.slice(negMatch[0].length).trim();
					break;
				}
			}
		}

		if (negationPrefix) {
			for (const { key: opKind, alias } of allPrefix) {
				const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);
				const pattern = isSymbol
					? `^${escapeRegex(alias)}\\s*`
					: `^${escapeRegex(alias)}(?![\\p{L}\\p{N}])\\s*`;
				const regex = new RegExp(pattern, "iu");
				const match = textAfterNegation.match(regex);
				if (match) {
					const remainder = textAfterNegation.slice(match[0].length).trim();
					return {
						operatorMatch: {
							operator: OPERATOR_INVERSIONS[opKind],
							position: "prefix",
							rawText: (negationPrefix + match[0]).trim(),
							matchedAlias: alias,
							isInverted: true,
						},
						remainderText: remainder,
					};
				}
			}
		}

		// Direct non-negated prefix match
		for (const { key: opKind, alias } of allPrefix) {
			const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);
			const pattern = isSymbol
				? `^${escapeRegex(alias)}\\s*`
				: `^${escapeRegex(alias)}(?![\\p{L}\\p{N}])\\s*`;
			const regex = new RegExp(pattern, "iu");
			const match = text.match(regex);
			if (match) {
				const remainder = text.slice(match[0].length).trim();
				return {
					operatorMatch: {
						operator: opKind,
						position: "prefix",
						rawText: match[0].trim(),
						matchedAlias: alias,
					},
					remainderText: remainder,
				};
			}
		}
	}

	// 2. Check configured Postfix Operators
	if (config.postfixAliases) {
		const allPostfix = flattenAndSortAliases(config.postfixAliases, false);

		// Check for user-defined NEG_POSTFIX (e.g. "ではない", "değil")
		for (const { key: opKind, alias } of allPostfix) {
			if (config.negationPostfixes) {
				for (const neg of config.negationPostfixes) {
					const combined = `${alias}\\s*${escapeRegex(neg)}`;
					const pattern = `(?<=[\\s\\p{P}]|^)${combined}$`;
					const regex = new RegExp(pattern, "iu");
					const match = text.match(regex);
					if (match && match.index !== undefined) {
						const remainder = text.slice(0, match.index).trim();
						return {
							operatorMatch: {
								operator: OPERATOR_INVERSIONS[opKind],
								position: "postfix",
								rawText: match[0].trim(),
								matchedAlias: alias,
								isInverted: true,
							},
							remainderText: remainder,
						};
					}
				}
			}

			const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);
			const pattern = isSymbol
				? `\\s*${escapeRegex(alias)}$`
				: `(?<=[\\s\\p{P}])${escapeRegex(alias)}$`;
			const regex = new RegExp(pattern, "iu");
			const match = text.match(regex);
			if (match && match.index !== undefined) {
				const remainder = text.slice(0, match.index).trim();
				return {
					operatorMatch: {
						operator: opKind,
						position: "postfix",
						rawText: match[0].trim(),
						matchedAlias: alias,
					},
					remainderText: remainder,
				};
			}
		}
	}

	return { remainderText: text };
}
