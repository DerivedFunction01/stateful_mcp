import type { ConceptFilterStore } from "@stateful-mcp/core";
import { isConceptAllowed } from "@stateful-mcp/core";
import type { MacroLearningService } from "../learning/macro-learning-service";
import type { ConceptLookup } from "../values/concept-value";
import type { MacroStore } from "./macro-definition";

export const AUTOCOMPL = [
	"macro",
	"argument",
	"concept",
	"enum",
	"measurement",
	"duration",
	"text",
	"boolean",
	"date",
	"number",
];
export type AutocompleteType = (typeof AUTOCOMPL)[number];

export interface AutocompleteSuggestion {
	label: string;
	value: string;
	type: AutocompleteType;
	detail?: string;
}

export interface AutocompleteRequest {
	query: string;
	scope?: AutocompleteType;
	argumentName?: string;
	macroName?: string;
	namespaceCode?: string;
	enumValues?: readonly string[];
	macroId?: string;
	macroVersion?: number;
	filledSlots?: readonly string[];
	previousSlot?: string;
	personnelId?: string;
}

export interface AutocompleteServiceDeps {
	macros: MacroStore;
	dictionary?: ConceptLookup;
	filterStore?: ConceptFilterStore;
	learningService?: MacroLearningService;
}

const MACRO_START_TOKEN = "^";
const MAX_SUGGESTIONS = 10;

function startsWithToken(query: string): boolean {
	return query.startsWith(MACRO_START_TOKEN);
}

function prefixAfterToken(query: string): string {
	return query.slice(MACRO_START_TOKEN.length);
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

function extractPrefixFromPattern(pattern: string): string | null {
	const match = pattern.match(/^([a-zA-Z0-9_\s]+)/);
	return match ? match[1]! : null;
}

export class MacroAutocomplete {
	constructor(private deps: AutocompleteServiceDeps) {}

	async suggest(req: AutocompleteRequest): Promise<AutocompleteSuggestion[]> {
		const { query, scope, argumentName, macroName, namespaceCode, enumValues } =
			req;

		// 1. Direct concept search overrides via tokens
		if (query.startsWith("#")) {
			const after = query.slice(1);
			const colonIndex = after.indexOf(":");
			let ns = namespaceCode;
			let conceptQuery = after;
			if (colonIndex !== -1) {
				ns = after.slice(0, colonIndex);
				conceptQuery = after.slice(colonIndex + 1);
			}
			return this.suggestConcepts(conceptQuery, ns, macroName, argumentName);
		}

		if (query.startsWith("@")) {
			return this.suggestConcepts(
				query.slice(1),
				namespaceCode,
				macroName,
				argumentName,
			);
		}

		// 2. Argument value autocompletion if argumentName and macroName are known
		if (macroName && argumentName) {
			const macro = await this.deps.macros.get(macroName);
			if (macro) {
				const arg = macro.arguments.find(
					(a) =>
						a.name.toLowerCase() === argumentName.toLowerCase() ||
						a.aliases?.some(
							(alias) => alias.toLowerCase() === argumentName.toLowerCase(),
						) ||
						a.roleName.toLowerCase() === argumentName.toLowerCase(),
				);
				if (arg) {
					return this.suggestValueForArgument(arg, query);
				}
			}
		}

		// 3. Fallbacks to scopes
		if (scope === "argument" && macroName) {
			return this.suggestArguments(macroName, query, argumentName, req);
		}
		if (scope === "enum") {
			return this.suggestEnums(query, enumValues);
		}
		if (scope === "concept") {
			return this.suggestConcepts(
				query,
				namespaceCode,
				macroName,
				argumentName,
			);
		}

		if (startsWithToken(query)) {
			return this.suggestMacros(prefixAfterToken(query));
		}

		return [];
	}

	private async suggestValueForArgument(
		arg: any,
		query: string,
	): Promise<AutocompleteSuggestion[]> {
		const spec = arg.extraction;
		if (!spec) return [];

		const suggestions: AutocompleteSuggestion[] = [];

		// Enum types
		if (spec.kind === "enum") {
			const allowed = spec.patterns ?? [];
			return this.suggestEnums(query, allowed);
		}

		// Scalar types with bounds
		if (spec.kind === "scalar") {
			const bounds = spec.numericBounds;
			if (bounds && bounds.min !== undefined && bounds.max !== undefined) {
				const step = bounds.step ?? 1;
				for (let v = bounds.min; v <= bounds.max; v += step) {
					const valStr = String(v);
					if (matchesPrefix(valStr, query)) {
						suggestions.push({
							label: valStr,
							value: valStr,
							type: "number" as const,
						});
					}
				}
				return suggestions.sort(sortSuggestions).slice(0, MAX_SUGGESTIONS);
			}
		}

		// Concept types
		if (spec.kind === "concept" || spec.kind === "concept_array") {
			return this.suggestConcepts(
				query,
				undefined,
				undefined,
				arg.name,
				arg.roleName,
			);
		}

		// Pattern-based literal template prefixes
		if (spec.patterns && spec.patterns.length > 0) {
			for (const pat of spec.patterns) {
				const prefix = extractPrefixFromPattern(pat);
				if (prefix && matchesPrefix(prefix, query)) {
					suggestions.push({
						label: prefix,
						value: prefix,
						type: "text" as const,
					});
				}
			}
		}

		return suggestions.sort(sortSuggestions).slice(0, MAX_SUGGESTIONS);
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
		req?: AutocompleteRequest,
	): Promise<AutocompleteSuggestion[]> {
		const macro = await this.deps.macros.get(macroName);
		if (!macro) return [];

		const targetArgumentName =
			argumentName?.toLowerCase() ?? prefix.toLowerCase();
		const matchingArguments = macro.arguments.filter((arg) => {
			if (req?.filledSlots?.includes(arg.argumentId)) return false;
			if (matchesPrefix(arg.name, targetArgumentName)) return true;
			if (arg.aliases?.some((a) => matchesPrefix(a, targetArgumentName)))
				return true;
			return matchesPrefix(arg.roleName, targetArgumentName);
		});
		const ranked =
			this.deps.learningService && req
				? await this.deps.learningService.rankCandidates(
						{
							macroId: req.macroId ?? macro.macroId,
							macroVersion: req.macroVersion ?? macro.version,
							previousSlot: req.previousSlot,
							filledSlots: req.filledSlots ?? [],
							personnelId: req.personnelId,
						},
						matchingArguments.map((argument) => ({
							argumentId: argument.argumentId,
						})),
					)
				: matchingArguments.map((argument) => ({
						candidate: { argumentId: argument.argumentId },
						score: 0,
						features: {},
					}));
		const suggestions: AutocompleteSuggestion[] = ranked
			.map(
				({ candidate }) =>
					macro.arguments.find(
						(arg) => arg.argumentId === candidate.argumentId,
					)!,
			)
			.map((arg) => ({
				label: arg.name,
				value: arg.name,
				type: "argument" as const,
				detail: arg.roleName,
			}))
			.sort((a, b) => {
				if (this.deps.learningService && req) return 0;
				return sortSuggestions(a, b);
			})
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
		macroName?: string,
		argumentName?: string,
		roleNameOverride?: string,
	): Promise<AutocompleteSuggestion[]> {
		if (!this.deps.dictionary) return [];
		const lowerQuery = query.trim().toLowerCase();
		let candidates = await this.deps.dictionary.search(
			query,
			namespaceCode,
			MAX_SUGGESTIONS * 2, // Search a bit more to allow room for filtered out items
		);
		if (lowerQuery) {
			candidates = candidates.filter(
				(c) =>
					c.display?.toLowerCase().startsWith(lowerQuery) ||
					c.standardCode?.toLowerCase().startsWith(lowerQuery),
			);
		}

		// Filter concepts using ConceptFilterStore if role context is available
		let roleName = roleNameOverride;
		if (!roleName && macroName && argumentName) {
			const macro = await this.deps.macros.get(macroName);
			const arg = macro?.arguments.find(
				(a) =>
					a.name.toLowerCase() === argumentName.toLowerCase() ||
					a.aliases?.some(
						(alias) => alias.toLowerCase() === argumentName.toLowerCase(),
					) ||
					a.roleName.toLowerCase() === argumentName.toLowerCase(),
			);
			if (arg) roleName = arg.roleName;
		}

		if (roleName && this.deps.filterStore) {
			const allowed: any[] = [];
			for (const c of candidates) {
				const filters = await this.deps.filterStore.listForConceptRole(
					c.id,
					roleName,
				);
				if (isConceptAllowed(filters, roleName)) {
					allowed.push(c);
				}
			}
			candidates = allowed;
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

		// Record impressions for candidates in the suggestion list
		if (
			this.deps.dictionary &&
			typeof (this.deps.dictionary as any).recordImpression === "function"
		) {
			const dictStore = this.deps.dictionary as any;
			const scope = { level: "global" };
			try {
				const exprs = dictStore.expressionStore
					? await dictStore.expressionStore.list(scope, true)
					: [];
				for (const c of candidates) {
					const matchingExprs = exprs.filter((e: any) => e.conceptId === c.id);
					for (const expr of matchingExprs) {
						dictStore.recordImpression(expr.id, c.id, {});
					}
				}
			} catch (e) {
				// Fall softly
			}
		}

		return suggestions;
	}
}
