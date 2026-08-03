/**
 * Canonical V2 merge strategy vocabulary.
 *
 * Centralized from the previously duplicated inline unions in macro-plan,
 * macro-definition, structured-cell, and typed-value. Semantics mirror the
 * mature legacy link/child merge logic (deep_merge / partial_fill / append /
 * replace) but are decoupled from the retired parser stack.
 */

export type MergeStrategy =
	| "replace"
	| "append"
	| "deep_merge"
	| "partial_fill";

export const MERGE_STRATEGIES: readonly MergeStrategy[] = [
	"replace",
	"append",
	"deep_merge",
	"partial_fill",
] as const;

export function isMergeStrategy(value: unknown): value is MergeStrategy {
	return (
		typeof value === "string" &&
		(MERGE_STRATEGIES as readonly string[]).includes(value)
	);
}

/**
 * Apply a merge strategy to a target.
 *
 * - `replace`: overwrite the existing value with the incoming value.
 * - `append`: push the incoming value onto an array (coerce null/undefined/scalar to array).
 * - `deep_merge`: shallow-merge the incoming object into the existing object.
 * - `partial_fill`: merge the incoming value but let existing populated fields win.
 */
export function applyMerge(
	existing: unknown,
	incoming: unknown,
	strategy: MergeStrategy,
): unknown {
	switch (strategy) {
		case "replace":
			return incoming;
		case "append":
			if (Array.isArray(existing)) return [...existing, incoming];
			if (existing === undefined || existing === null) return [incoming];
			return [existing, incoming];
		case "deep_merge":
			if (isPlainObject(existing) && isPlainObject(incoming))
				return { ...existing, ...incoming };
			return incoming;
		case "partial_fill":
			if (isPlainObject(existing) && isPlainObject(incoming))
				return { ...incoming, ...existing };
			return existing === undefined || existing === null ? incoming : existing;
	}
}

/**
 * Clinical write policies map onto the canonical merge strategies.
 *
 * - `upsert`: create-or-merge -> `deep_merge`
 * - `patch`: keep existing, fill gaps -> `partial_fill`
 * - `append`: push into a `many` field -> `append`
 * - `replace`: overwrite (reserved / opt-in) -> `replace`
 */
export type ClinicalWritePolicy = "upsert" | "patch" | "append" | "replace";

export function writePolicyToMergeStrategy(
	policy: ClinicalWritePolicy,
): MergeStrategy {
	switch (policy) {
		case "upsert":
			return "deep_merge";
		case "patch":
			return "partial_fill";
		case "append":
			return "append";
		case "replace":
			return "replace";
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}
