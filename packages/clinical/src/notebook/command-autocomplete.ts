import type { CommandDescriptor } from "../session/command-descriptor";

export interface AutocompleteSuggestion {
	verb: string;
	group: string;
	source: "editor" | "cell";
	hasArgs: boolean;
	argNames?: string[];
	argHints?: string[][];
	argsRequired?: boolean[];
}

const MAX_SUGGESTIONS = 12;

function toSuggestion(
	d: CommandDescriptor,
	source: "editor" | "cell",
): AutocompleteSuggestion {
	return {
		verb: d.verb,
		group: d.group,
		source,
		hasArgs: d.args.length > 0,
		argNames: d.args.map((a) => a.name),
		argHints: d.args.map((a) => a.completions ?? []),
		argsRequired: d.args.map((a) => a.required),
	};
}

export function getAutocompleteSuggestions(
	partial: string,
	editorDescriptors: CommandDescriptor[],
	cellDescriptors: CommandDescriptor[],
): AutocompleteSuggestion[] {
	if (!partial) return [];
	const seen = new Set<string>();
	const all: { d: CommandDescriptor; source: "editor" | "cell" }[] = [
		...editorDescriptors.map((d) => ({ d, source: "editor" as const })),
		...cellDescriptors.map((d) => ({ d, source: "cell" as const })),
	];
	return all
		.filter(({ d }) => {
			if (seen.has(d.verb)) return false;
			if (!d.verb.startsWith(partial)) return false;
			seen.add(d.verb);
			return true;
		})
		.slice(0, MAX_SUGGESTIONS)
		.map(({ d, source }) => toSuggestion(d, source));
}

export function getArgCompletions(
	verb: string,
	editorDescriptors: CommandDescriptor[],
	cellDescriptors: CommandDescriptor[],
): AutocompleteSuggestion | undefined {
	const all = [...editorDescriptors, ...cellDescriptors];
	const desc = all.find((d) => d.verb === verb);
	if (!desc) return undefined;
	return toSuggestion(desc, desc.verb === verb ? "editor" : "cell");
}

export function cycleAutocomplete(
	suggestions: AutocompleteSuggestion[],
	currentIndex: number,
	direction: 1 | -1,
): { nextIndex: number; nextVerb: string } {
	if (suggestions.length === 0) return { nextIndex: -1, nextVerb: "" };
	const nextIndex =
		((currentIndex + direction) % suggestions.length + suggestions.length) %
		suggestions.length;
	return { nextIndex, nextVerb: suggestions[nextIndex]!.verb };
}