import type { CommandDescriptor } from "../session/command-descriptor";

export type AutocompleteSuggestionKind = "verb" | "arg";

export interface AutocompleteSuggestion {
	verb: string;
	group: string;
	source: "editor" | "cell";
	hasArgs: boolean;
	argNames?: string[];
	argHints?: string[][];
	argsRequired?: boolean[];
	/** Semantic role of the suggestion: a command verb vs an argument value. */
	kind: AutocompleteSuggestionKind;
	/** Argument position this value fills (kind === "arg"). */
	argIndex?: number;
	/** The CommandArgSchema.name this value fills (kind === "arg"). */
	argName?: string;
	/** Locale-neutral i18n description key for the command/arg. */
	descriptionKey?: string;
}

const MAX_SUGGESTIONS = 12;

function toSuggestion(
	d: CommandDescriptor,
	source: "editor" | "cell",
	verb: string = d.verb,
): AutocompleteSuggestion {
	return {
		verb,
		group: d.group,
		source,
		hasArgs: d.args.length > 0,
		argNames: d.args.map((a) => a.name),
		argHints: d.args.map((a) => a.completions ?? []),
		argsRequired: d.args.map((a) => a.required),
		kind: "verb",
		descriptionKey: d.descriptionKey,
	};
}

export function getAutocompleteSuggestions(
	partial: string,
	editorDescriptors: CommandDescriptor[],
	cellDescriptors: CommandDescriptor[],
): AutocompleteSuggestion[] {
	if (!partial) return [];
	const partialLower = partial.toLowerCase();

    // Combine descriptors with source
    const allDesc = [
      ...editorDescriptors.map((d) => ({ d, source: "editor" as const })),
      ...cellDescriptors.map((d) => ({ d, source: "cell" as const })),
    ];

    const results: AutocompleteSuggestion[] = [];
    const seenCanonical = new Set<string>();

    for (const { d, source } of allDesc) {
      const canonicalVerb = d.verb.toLowerCase();
      if (seenCanonical.has(canonicalVerb)) continue;

      const names = [d.verb, ...(d.aliases ?? [])];
      const matchingNames = names.filter((name) => name.toLowerCase().startsWith(partialLower));

      if (matchingNames.length > 0) {
        // Sort to favor exact matches first, then shortest length
        matchingNames.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          if (aLower === partialLower) return -1;
          if (bLower === partialLower) return 1;
          return a.length - b.length;
        });
        // Use the canonical verb for display, even if the match was an alias
        results.push(toSuggestion(d, source, d.verb));
        seenCanonical.add(canonicalVerb);
      }
    }

    return results.slice(0, MAX_SUGGESTIONS);
}

export function getArgCompletions(
	verb: string,
	editorDescriptors: CommandDescriptor[],
	cellDescriptors: CommandDescriptor[],
): AutocompleteSuggestion | undefined {
	const all = [...editorDescriptors, ...cellDescriptors];
	const verbLower = verb.toLowerCase();
	const desc = all.find(
		(d) =>
			d.verb.toLowerCase() === verbLower ||
			d.aliases?.some((a) => a.toLowerCase() === verbLower),
	);
	if (!desc) return undefined;
	const bestName = [desc.verb, ...(desc.aliases ?? [])].find(
		(name) => name.toLowerCase() === verbLower,
	) ?? desc.verb;
	return toSuggestion(desc, desc.verb === bestName ? "editor" : "cell", bestName);
}

export function cycleAutocomplete(
	suggestions: AutocompleteSuggestion[],
	currentIndex: number,
	direction: 1 | -1,
): { nextIndex: number; nextVerb: string } {
	if (suggestions.length === 0) return { nextIndex: -1, nextVerb: "" };
	const nextIndex =
		(((currentIndex + direction) % suggestions.length) + suggestions.length) %
		suggestions.length;
	return { nextIndex, nextVerb: suggestions[nextIndex]!.verb };
}
