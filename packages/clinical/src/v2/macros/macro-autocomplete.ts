import type { ConceptLookup } from "../values/concept-value";
import type { MacroStore } from "./macro-definition";

export interface AutocompleteSuggestion {
	label: string;
	value: string;
	type: "macro" | "argument" | "concept" | "enum";
	detail?: string;
}

export interface AutocompleteRequest {
	query: string;
	scope?: "macro" | "argument" | "concept" | "enum";
	argumentName?: string;
	macroName?: string;
	namespaceCode?: string;
	enumValues?: readonly string[];
}

export interface AutocompleteServiceDeps {
	macros: MacroStore;
	dictionary?: ConceptLookup;
}

const MACRO_START_TOKEN = "^";
const MAX_SUGGESTIONS = 10;

function startsWithToken(query: string): boolean {
	return query.startsWith(MACRO_START_TOKEN);
}

function prefixAfterToken(query: string): string {
	return query.slice(MACRO_START_TOKEN.length);
}

function isConceptKind(extractionKind: string): boolean {
	return extractionKind === "concept" || extractionKind === "concept_array";
}

function matchesPrefix(text: string, prefix: string): boolean {
	return text.toLowerCase().startsWith(prefix.toLowerCase());
}

function sortSuggestions(
	a: AutocompleteSuggestion,
	b: AutocompleteSuggestion,
): number {
	return a.label.localeCompare(b.label);
}

export class MacroAutocomplete {
	constructor(private deps: AutocompleteServiceDeps) {}

	async suggest(req: AutocompleteRequest): Promise<AutocompleteSuggestion[]> {
		const { query, scope, argumentName, macroName, namespaceCode, enumValues } =
			req;

		if (scope === "argument" && macroName) {
			return this.suggestArguments(macroName, query, argumentName);
		}
		if (scope === "enum") {
			return this.suggestEnums(query, enumValues);
		}
		if (scope === "concept") {
			return this.suggestConcepts(query, namespaceCode);
		}

		if (startsWithToken(query)) {
			return this.suggestMacros(prefixAfterToken(query));
		}

		return [];
	}

	private async suggestMacros(
		prefix: string,
	): Promise<AutocompleteSuggestion[]> {
		const all = await this.deps.macros.list();
		const suggestions: AutocompleteSuggestion[] = all
			.filter((m) => matchesPrefix(m.macroName, prefix))
			.map((m) => ({
				label: m.macroName,
				value: m.macroName,
				type: "macro" as const,
			}))
			.sort(sortSuggestions)
			.slice(0, MAX_SUGGESTIONS);
		return suggestions;
	}

	private async suggestArguments(
		macroName: string,
		prefix: string,
		argumentName?: string,
	): Promise<AutocompleteSuggestion[]> {
		const macro = await this.deps.macros.get(macroName);
		if (!macro) return [];

		const targetArgumentName =
			argumentName?.toLowerCase() ?? prefix.toLowerCase();
		const suggestions: AutocompleteSuggestion[] = macro.arguments
			.filter((arg) => {
				if (matchesPrefix(arg.name, targetArgumentName)) return true;
				if (arg.aliases?.some((a) => matchesPrefix(a, targetArgumentName)))
					return true;
				return matchesPrefix(arg.roleName, targetArgumentName);
			})
			.map((arg) => ({
				label: arg.name,
				value: arg.name,
				type: "argument" as const,
				detail: arg.roleName,
			}))
			.sort(sortSuggestions)
			.slice(0, MAX_SUGGESTIONS);
		return suggestions;
	}

	private suggestEnums(
		prefix: string,
		enumValues?: readonly string[],
	): AutocompleteSuggestion[] {
		if (!enumValues) return [];
		const lowerPrefix = prefix.trim().toLowerCase();
		if (!lowerPrefix) return [];
		const suggestions: AutocompleteSuggestion[] = enumValues
			.filter((v) => v.toLowerCase().includes(lowerPrefix))
			.map((v) => ({
				label: v,
				value: v,
				type: "enum" as const,
			}))
			.sort(sortSuggestions)
			.slice(0, MAX_SUGGESTIONS);
		return suggestions;
	}

	private async suggestConcepts(
		query: string,
		namespaceCode?: string,
	): Promise<AutocompleteSuggestion[]> {
		if (!this.deps.dictionary) return [];
		const lowerQuery = query.trim().toLowerCase();
		let candidates = await this.deps.dictionary.search(
			query,
			namespaceCode,
			MAX_SUGGESTIONS,
		);
		if (lowerQuery) {
			candidates = candidates.filter(
				(c) =>
					c.display?.toLowerCase().startsWith(lowerQuery) ||
					c.standardCode?.toLowerCase().startsWith(lowerQuery),
			);
		}
		const suggestions: AutocompleteSuggestion[] = candidates
			.filter((c) => c.active !== false)
			.map((c) => ({
				label: c.display,
				value: `${c.namespaceCode}::${c.standardCode}`,
				type: "concept" as const,
				detail: c.standardCode,
			}))
			.sort(sortSuggestions)
			.slice(0, MAX_SUGGESTIONS);
		return suggestions;
	}
}
