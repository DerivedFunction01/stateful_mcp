import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";

export const MAX_VERB = 8;
export const MAX_ARG = 4;

/**
 * Cap the visible candidate chips to fit the terminal width. When the terminal
 * is too narrow or there are too many candidates, keep the active one visible
 * and collapse the rest behind a `+n more` tail.
 */
export function capSuggestions(
	width: number,
	suggestions: AutocompleteSuggestion[],
	activeIndex: number,
): { visible: AutocompleteSuggestion[]; hidden: number } {
	if (suggestions.length === 0) return { visible: [], hidden: 0 };

	let verbBudget = MAX_VERB;
	let argBudget = MAX_ARG;
	const total = suggestions.length;

	// Fall back to "active candidate + count" on a very narrow terminal.
	if (width < 40)
		return { visible: [suggestions[activeIndex]!], hidden: total - 1 };

	// Narrow-ish terminals halve the budget.
	if (width < 80) {
		verbBudget = 4;
		argBudget = 2;
	}

	// Slice by kind keeping the requested budget for each.
	const keepVerb = suggestions
		.filter((s) => s.kind !== "arg")
		.slice(0, verbBudget);
	const keepArg = suggestions
		.filter((s) => s.kind === "arg")
		.slice(0, argBudget);
	const kept = [...keepVerb, ...keepArg];

	// Ensure the active candidate is always shown.
	if (
		activeIndex >= 0 &&
		activeIndex < suggestions.length &&
		!kept.includes(suggestions[activeIndex]!)
	) {
		kept.push(suggestions[activeIndex]!);
	}
	const visible = Array.from(new Set(kept));
	const hidden = suggestions.length - visible.length;
	return { visible, hidden };
}
