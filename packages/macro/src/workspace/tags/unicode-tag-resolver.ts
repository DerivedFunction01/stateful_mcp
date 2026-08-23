/**
 * Locale-agnostic Unicode tag utilities.
 *
 * All tag operations — normalization, comparison, deduplication — pass through
 * here so the rest of the codebase never deals with raw, un-normalized strings.
 *
 * Design decisions:
 * - NFC normalization prevents OS-level diacritic encoding discrepancies
 *   (e.g. `cirugi\u0301a` → `cirugía`, `ト\u3099` → `ド`).
 * - Filtering uses `Intl.Collator` with `sensitivity: "base"` for accent- and
 *   case-insensitive search across all Unicode scripts (CJK, Cyrillic, Arabic,
 *   Devanagari, Accented Latin, etc.).
 * - Tags are NOT split on any delimiter. They are always entered as discrete
 *   atomic strings committed by the caller (e.g. on Enter key-press).
 */

/**
 * Normalize a raw tag string to canonical NFC form with surrounding whitespace
 * stripped. Returns an empty string if the input is blank.
 */
export function normalizeTag(raw: string): string {
	return raw.trim().normalize("NFC");
}

/**
 * Returns true if `query` matches `target` using locale-sensitive, case- and
 * accent-insensitive string search. An empty query always matches.
 *
 * Uses `Intl.Collator` with `{ sensitivity: "base", usage: "search" }` which
 * ignores case and diacritics, enabling cross-script filtering.
 */
export function matchesTag(
	query: string,
	target: string,
	locale?: string,
): boolean {
	if (!query) return true;
	const normalizedQuery = normalizeTag(query);
	const normalizedTarget = normalizeTag(target);
	if (!normalizedQuery) return true;

	// Build a collator for the given locale (falls back to runtime default).
	const collator = new Intl.Collator(locale, {
		sensitivity: "base",
		usage: "search",
	});

	// Intl.Collator does not have a built-in `includes`-style search in all
	// environments, so we slide a window across the target.
	const qLen = normalizedQuery.length;
	const tLen = normalizedTarget.length;
	if (qLen > tLen) return false;

	for (let i = 0; i <= tLen - qLen; i++) {
		const slice = normalizedTarget.slice(i, i + qLen);
		if (collator.compare(slice, normalizedQuery) === 0) return true;
	}
	return false;
}

/**
 * Deduplicate an array of tags after NFC normalization. The first occurrence
 * of each normalized form is kept; subsequent duplicates are dropped.
 * Comparison is exact after normalization (not accent-insensitive) to preserve
 * author intent (e.g. `cardio` and `Cardio` are kept as distinct if both were
 * deliberately added).
 */
export function deduplicateTags(tags: readonly string[]): readonly string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const tag of tags) {
		const normalized = normalizeTag(tag);
		if (normalized && !seen.has(normalized)) {
			seen.add(normalized);
			result.push(normalized);
		}
	}
	return result;
}

/**
 * Returns true if `tags` already contains a tag that is NFC-equal to `candidate`
 * (exact match after normalization).
 */
export function hasTag(tags: readonly string[], candidate: string): boolean {
	const normalized = normalizeTag(candidate);
	return tags.some((t) => normalizeTag(t) === normalized);
}
