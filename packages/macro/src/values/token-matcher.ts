import { escapeRegex, getCompiledRegex } from "./regex";

export interface SortedAliasPair<K extends string = string> {
	readonly key: K;
	readonly alias: string;
}

/**
 * WeakMap cache keyed on user configuration alias mapping object references.
 * Prevents re-allocating and re-sorting alias tuples on subsequent parse invocations.
 */
const aliasCache = new WeakMap<
	object,
	Map<boolean, readonly SortedAliasPair<any>[]>
>();

/**
 * Flattens an alias mapping into a length-descending array of { key, alias } pairs
 * to guarantee longest-match precedence during token resolution.
 * Automatically memoized per alias object reference and includeKeyAsAlias mode.
 */
export function flattenAndSortAliases<K extends string>(
	aliases?: Readonly<Partial<Record<K, readonly string[]>>>,
	includeKeyAsAlias = true,
): readonly SortedAliasPair<K>[] {
	if (!aliases) return [];

	if (typeof aliases === "object" && aliases !== null) {
		const cachedForObj = aliasCache.get(aliases);
		const cachedResult = cachedForObj?.get(includeKeyAsAlias);
		if (cachedResult) {
			return cachedResult as readonly SortedAliasPair<K>[];
		}
	}

	const pairs: SortedAliasPair<K>[] = [];
	for (const [key, aliasList] of Object.entries(aliases) as [
		K,
		readonly string[] | undefined,
	][]) {
		if (!aliasList) continue;
		if (includeKeyAsAlias) {
			pairs.push({ key, alias: key });
		}
		for (const alias of aliasList) {
			if (alias && (!includeKeyAsAlias || alias !== key)) {
				pairs.push({ key, alias });
			}
		}
	}

	const sorted = Object.freeze(
		pairs.sort((a, b) => b.alias.length - a.alias.length),
	);

	if (typeof aliases === "object" && aliases !== null) {
		let map = aliasCache.get(aliases);
		if (!map) {
			map = new Map();
			aliasCache.set(aliases, map);
		}
		map.set(includeKeyAsAlias, sorted);
	}

	return sorted;
}

/**
 * Matches a prefix alias at the beginning of a string, supporting symbol
 * and Unicode character boundaries without assuming whitespace.
 * Uses cached compiled regular expressions.
 */
export function extractPrefixAlias<K extends string>(
	text: string,
	sortedAliases: readonly SortedAliasPair<K>[],
	locales?: string | readonly string[],
): { key: K; matchedAlias: string; remainderText: string } | undefined {
	const trimmed = text.trim();
	if (!trimmed) return undefined;
	const lower = trimmed.toLocaleLowerCase(locales as string);

	for (const { key, alias } of sortedAliases) {
		const aliasLower = alias.toLocaleLowerCase(locales as string);
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);
		const escaped = escapeRegex(aliasLower);
		const pattern = isSymbol
			? `^${escaped}\\s*`
			: `^${escaped}(?=[\\d\\p{Nd}\\s\\p{P}]|$)`;
		const regex = getCompiledRegex(pattern, "iu");
		const match = lower.match(regex);
		if (match && match.index === 0) {
			const matchLen = match[0].length;
			const remainder = trimmed.slice(matchLen).trim();
			return { key, matchedAlias: alias, remainderText: remainder };
		}
	}
	return undefined;
}

/**
 * Matches a postfix alias at the end of a string, supporting symbol
 * and Unicode character boundaries without assuming whitespace.
 * Uses cached compiled regular expressions.
 */
export function extractPostfixAlias<K extends string>(
	text: string,
	sortedAliases: readonly SortedAliasPair<K>[],
	locales?: string | readonly string[],
): { key: K; matchedAlias: string; remainderText: string } | undefined {
	const trimmed = text.trim();
	if (!trimmed) return undefined;
	const lower = trimmed.toLocaleLowerCase(locales as string);

	for (const { key, alias } of sortedAliases) {
		const aliasLower = alias.toLocaleLowerCase(locales as string);
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);
		const escaped = escapeRegex(aliasLower);
		const pattern = isSymbol
			? `\\s*${escaped}$`
			: `(?<=[\\d\\p{Nd}\\s\\p{P}]|^)${escaped}$`;
		const regex = getCompiledRegex(pattern, "iu");
		const match = lower.match(regex);
		if (match && match.index !== undefined) {
			const remainder = trimmed.slice(0, match.index).trim();
			return { key, matchedAlias: alias, remainderText: remainder };
		}
	}
	return undefined;
}

/**
 * Splits text by user-defined delimiters sorted by descending length.
 * Uses cached compiled regular expressions.
 */
export function splitByDelimiters(
	text: string,
	delimiters: readonly string[],
	options: { requireBoundaries?: boolean } = {},
): { parts: string[]; delimiter: string } | undefined {
	const sorted = [...delimiters].sort((a, b) => b.length - a.length);

	for (const delim of sorted) {
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(delim);
		const escaped = escapeRegex(delim);
		const pattern = isSymbol
			? options.requireBoundaries
				? `(?:\\s+${escaped}\\s+|(?<=[\\d\\p{Nd}])\\s*${escaped}\\s*(?=[\\d\\p{Nd}]))`
				: `\\s*${escaped}\\s*`
			: `\\s+${escaped}\\s+`;
		const regex = getCompiledRegex(pattern, "iu");
		if (regex.test(text)) {
			const parts = text
				.split(regex)
				.map((p) => p.trim())
				.filter(Boolean);
			if (parts.length > 1) {
				return { parts, delimiter: delim };
			}
		}
	}
	return undefined;
}
