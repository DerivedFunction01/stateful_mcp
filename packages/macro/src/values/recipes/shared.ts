import { escapeRegex } from "../regex";
import type { RecipeEvaluation } from "./types";

function terminalValue(slot: RecipeEvaluation | undefined): unknown {
	return slot && slot.kind === "terminal" ? slot.value : undefined;
}

/** Resolve a slot value by exact id, falling back to the first `{name}_` prefixed terminal slot. */
export function slotValue(
	evaluation: RecipeEvaluation | undefined,
	name: string,
): unknown {
	if (!evaluation || evaluation.kind !== "fundamental") return undefined;
	const exact = terminalValue(evaluation.slots[name]);
	if (exact !== undefined) return exact;
	const slot = Object.keys(evaluation.slots).find((id) =>
		id.startsWith(`${name}_`),
	);
	return slot ? terminalValue(evaluation.slots[slot]) : undefined;
}

/** Resolve all `{name}_` prefixed terminal slot values. */
export function slotValues(
	evaluation: RecipeEvaluation,
	name: string,
): unknown[] {
	if (evaluation.kind !== "fundamental") return [];
	return Object.keys(evaluation.slots)
		.filter((id) => id.startsWith(`${name}_`))
		.map((id) => terminalValue(evaluation.slots[id]));
}

/** Build a regex alternation string from a list of literals. */
export function buildAliasAlternation(
	values: readonly string[] | undefined,
): string {
	return `(?:${(values ?? []).map(escapeRegex).join("|")})`;
}

/** Build a deduplicated regex alternation string from a list of literals. */
export function buildMarkerPattern(values: readonly string[]): string {
	return `(?:${Array.from(new Set(values)).map(escapeRegex).join("|")})`;
}
