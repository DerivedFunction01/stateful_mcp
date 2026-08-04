import type { AutocompleteSuggestion } from "./autocomplete";
import type { CommandDescriptor } from "./command-descriptor";

/** Semantic cap mirroring V1 `MAX_SUGGESTIONS = 12`. */
export const MAX_SUGGESTIONS = 12;

/**
 * V1-style canonical dedup autocomplete.
 *
 * Mirrors `getAutocompleteSuggestions(partial, editorDescriptors, cellDescriptors)`
 * from the V1 `command-autocomplete.ts`:
 * - one chip per canonical verb (seenCanonical keyed by `d.verb.toLowerCase()`);
 * - match any alias but emit the canonical `verb`;
 * - sort exact-match-first, then shortest verb;
 * - cap at `MAX_SUGGESTIONS` (12).
 *
 * The `token` is the command prefix (`:` or `^`) used to build `completionText`.
 * `source`/`group` are passed through to the suggestion for UI rendering.
 */
export function dedupeCanonicalSuggestions(
	descriptors: CommandDescriptor[],
	partial: string,
	token: string,
	source: AutocompleteSuggestion["source"] = "editor",
	group = "v2",
): AutocompleteSuggestion[] {
	const partialLower = partial.toLowerCase();
	if (!partialLower) return [];

	const seenCanonical = new Set<string>();
	const matched: CommandDescriptor[] = [];

	for (const d of descriptors) {
		const canonical = d.verb.toLowerCase();
		if (seenCanonical.has(canonical)) continue;
		const names = [d.verb, ...d.aliases];
		const hasPrefixMatch = names.some((name) =>
			name.toLowerCase().startsWith(partialLower),
		);
		if (hasPrefixMatch) {
			seenCanonical.add(canonical);
			matched.push(d);
		}
	}

	// Sort: exact match first, then shortest verb (V1 order).
	matched.sort((a, b) => {
		const aExact = a.verb.toLowerCase() === partialLower ? 0 : 1;
		const bExact = b.verb.toLowerCase() === partialLower ? 0 : 1;
		if (aExact !== bExact) return aExact - bExact;
		return a.verb.length - b.verb.length;
	});

	return matched.slice(0, MAX_SUGGESTIONS).map((d) => ({
		label: d.verb,
		value: `${token}${d.verb}`,
		type: "command",
		verb: d.verb,
		completionText: d.verb,
		group: d.group ?? group,
		source,
		hasArgs: (d.args?.length ?? 0) > 0,
		kind: "verb",
		argNames: d.args?.map((a) => a.name),
		argsRequired: d.args?.map((a) => a.required ?? false),
		descriptionKey: d.descriptionKey,
	}));
}

/**
 * Return the set of known canonical verbs (lowercased) from the descriptor
 * list. Used to suppress spurious "no command matches" warnings when a verb
 * is genuinely known but produced no argument suggestions.
 */
export function knownVerbs(descriptors: CommandDescriptor[]): Set<string> {
	const set = new Set<string>();
	for (const d of descriptors) {
		set.add(d.verb.toLowerCase());
		for (const alias of d.aliases) set.add(alias.toLowerCase());
	}
	return set;
}