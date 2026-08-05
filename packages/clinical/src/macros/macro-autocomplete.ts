import type { ConceptFilterStore } from "@stateful-mcp/core";
import { isConceptAllowed } from "@stateful-mcp/core";
import type { MacroLearningService } from "../learning/macro-learning-service";
import type { MacroLearningRankedCandidate } from "../learning/macro-learning-types";
import type { ConceptLookup } from "../values/concept-value";
import type { TypedValue } from "../values/typed-value";
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
	"template",
];
export type AutocompleteType = (typeof AUTOCOMPL)[number];

export interface AutocompleteSuggestion {
	label: string;
	value: string;
	type: AutocompleteType;
	detail?: string;
	source?: "macro" | "dictionary" | "custom-expression" | "template";
	expressionId?: string;
	conceptId?: string;
	lookupTerm?: string;
	argumentId?: string;
	macro?: {
		macroId: string;
		macroVersion: number;
		argumentId?: string;
		evidence?: MacroSuggestionEvidence;
	};
}

export interface MacroSuggestionEvidence {
	score?: number;
	observationCount?: number;
	scope?: "personal" | "global";
	observationMode?: "live" | "preview" | "execution";
	reason?: "transition" | "numericFit" | "parseConfidence" | "static";
	featureKeys?: readonly string[];
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
	conceptToken?: string;
	expressionToken?: string;
	conceptCodeSeparator?: string;
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
		let activeArgumentKind: string | undefined;
		if (macroName && argumentName) {
			const macro = await this.deps.macros.get(macroName);
			const argument = macro?.arguments.find(
				(candidate) =>
					candidate.name.toLowerCase() === argumentName.toLowerCase() ||
					candidate.aliases?.some(
						(alias) => alias.toLowerCase() === argumentName.toLowerCase(),
					) ||
					candidate.roleName.toLowerCase() === argumentName.toLowerCase(),
			);
			activeArgumentKind = argument?.extraction.kind;
		}
		const lookupArgument =
			!activeArgumentKind ||
			activeArgumentKind === "concept" ||
			activeArgumentKind === "concept_array";

		// Direct concept search is driven by the active syntax profile.
		const conceptToken = this.deps.conceptToken;
		if (
			lookupArgument &&
			conceptToken &&
			query.toLocaleLowerCase().startsWith(conceptToken.toLocaleLowerCase())
		) {
			const after = query.slice(conceptToken.length);
			const separator = this.deps.conceptCodeSeparator ?? "";
			const separatorIndex = separator ? after.indexOf(separator) : -1;
			let ns = namespaceCode;
			let conceptQuery = after;
			if (separatorIndex !== -1) {
				ns = after.slice(0, separatorIndex);
				conceptQuery = after.slice(separatorIndex + separator.length);
			}
			return this.suggestConcepts(conceptQuery, ns, macroName, argumentName);
		}

		const expressionToken = this.deps.expressionToken;
		if (
			lookupArgument &&
			expressionToken &&
			query.toLocaleLowerCase().startsWith(expressionToken.toLocaleLowerCase())
		) {
			return this.suggestCustomExpressions(
				query.slice(expressionToken.length),
				undefined,
				macroName,
				argumentName,
				true,
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
					return this.suggestValueForArgument(arg, query, macro, req);
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
		if (scope === "template" && macroName) {
			return this.suggestTemplates(macroName, query, req);
		}

		if (startsWithToken(query)) {
			return this.suggestMacros(prefixAfterToken(query));
		}

		return [];
	}

	private async suggestValueForArgument(
		arg: any,
		query: string,
		macro?: any,
		req?: AutocompleteRequest,
	): Promise<AutocompleteSuggestion[]> {
		const spec = arg.extraction;
		if (!spec) return [];

		const suggestions: AutocompleteSuggestion[] = [];

		// Enum types
		if (spec.kind === "enum") {
			const allowed = spec.patterns ?? [];
			return this.rankValueSuggestions(
				arg,
				this.suggestEnums(query, allowed),
				macro,
				req,
			);
		}

		// Scalar types with bounds
		if (spec.kind === "scalar") {
			if (!query.trim()) return [];
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
				return this.rankValueSuggestions(
					arg,
					suggestions.sort(sortSuggestions).slice(0, MAX_SUGGESTIONS),
					macro,
					req,
				);
			}
		}

		// Concept types
		if (spec.kind === "concept" || spec.kind === "concept_array") {
			return this.rankValueSuggestions(
				arg,
				await this.suggestCustomExpressions(
					query,
					arg.roleName,
					undefined,
					undefined,
					true,
				),
				macro,
				req,
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

	private async rankValueSuggestions(
		arg: any,
		suggestions: AutocompleteSuggestion[],
		macro?: any,
		req?: AutocompleteRequest,
	): Promise<AutocompleteSuggestion[]> {
		if (!suggestions.length || !this.deps.learningService || !macro || !req) {
			return suggestions;
		}
		const candidates = suggestions.map((suggestion) => ({
			argumentId: arg.argumentId,
			value:
				arg.extraction.kind === "enum"
					? ({ kind: "enum", value: suggestion.value } as TypedValue)
					: arg.extraction.kind === "concept" ||
							arg.extraction.kind === "concept_array"
						? ({
								kind: "concept",
								concept: {
									conceptId: suggestion.value,
									display: suggestion.label,
								},
							} as TypedValue)
						: ({
								kind: "scalar",
								scalarType: "number",
								value: Number(suggestion.value),
							} as TypedValue),
		}));
		const ranked = await this.deps.learningService.rankCandidates(
			{
				macroId: req.macroId ?? macro.macroId,
				macroVersion: req.macroVersion ?? macro.version,
				previousSlot: req.previousSlot,
				filledSlots: req.filledSlots ?? [],
				personnelId: req.personnelId,
			},
			candidates,
		);
		const byValue = new Map(
			suggestions.map((suggestion) => [suggestion.value, suggestion]),
		);
		return ranked.flatMap(({ candidate, score, features, evidence }) => {
			const value =
				candidate.value && "value" in candidate.value
					? String(candidate.value.value)
					: candidate.value && "concept" in candidate.value
						? candidate.value.concept.conceptId
						: undefined;
			const suggestion = value ? byValue.get(value) : undefined;
			if (!suggestion) return [];
			return [
				{
					...suggestion,
					macro: {
						macroId: macro.macroId,
						macroVersion: macro.version,
						argumentId: arg.argumentId,
						evidence: evidence
							? {
									score,
									observationCount: evidence.observationCount,
									scope: evidence.scope,
									observationMode: evidence.observationMode,
									reason:
										(features.numericFit ?? 0) > (features.transition ?? 0)
											? ("numericFit" as const)
											: ("transition" as const),
									featureKeys: evidence.featureKeys,
								}
							: undefined,
					},
				},
			];
		});
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
		const ranked: MacroLearningRankedCandidate[] =
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
			.map(({ candidate, score, features, evidence }) => {
				const arg = macro.arguments.find(
					(item) => item.argumentId === candidate.argumentId,
				)!;
				return {
					label: arg.name,
					value: arg.name,
					type: "argument" as const,
					detail: arg.roleName,
					...(evidence
						? {
								macro: {
									macroId: macro.macroId,
									macroVersion: macro.version,
									argumentId: arg.argumentId,
									evidence: {
										score,
										observationCount: evidence?.observationCount,
										scope: evidence?.scope,
										observationMode: evidence?.observationMode,
										reason:
											(features.numericFit ?? 0) > (features.transition ?? 0)
												? ("numericFit" as const)
												: ("transition" as const),
										featureKeys: evidence?.featureKeys,
									},
								},
							}
						: {}),
				};
			})
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
		if (candidates.length === 0 && query !== lowerQuery) {
			candidates = await this.deps.dictionary.search(
				lowerQuery,
				namespaceCode,
				MAX_SUGGESTIONS * 2,
			);
		}
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

	private async suggestCustomExpressions(
		query: string,
		roleName?: string,
		macroName?: string,
		argumentName?: string,
		allowEmpty = false,
	): Promise<AutocompleteSuggestion[]> {
		const search = this.deps.dictionary?.searchExpressionCandidates?.bind(
			this.deps.dictionary,
		);
		if (!search || (!allowEmpty && !query.trim())) return [];
		if (!roleName && macroName && argumentName) {
			const macro = await this.deps.macros.get(macroName);
			const argument = macro?.arguments.find(
				(candidate) =>
					candidate.name.toLowerCase() === argumentName.toLowerCase() ||
					candidate.aliases?.some(
						(alias) => alias.toLowerCase() === argumentName.toLowerCase(),
					) ||
					candidate.roleName.toLowerCase() === argumentName.toLowerCase(),
			);
			roleName = argument?.roleName;
		}
		const expressions = await search({
			lookupPrefix: query.trim().toLocaleLowerCase(),
			targetAssignments: roleName ? [roleName] : undefined,
			activeOnly: true,
			limit: MAX_SUGGESTIONS,
		});
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return expressions
			.filter(
				(expression) =>
					expression.active &&
					Boolean(expression.conceptId) &&
					Boolean(expression.lookupTerm ?? expression.term),
			)
			.map((expression) => ({
				label: expression.term,
				value: expression.lookupTerm ?? expression.term,
				type: "concept" as const,
				detail: "custom expression",
				source: "custom-expression" as const,
				expressionId: expression.id,
				conceptId: expression.conceptId,
				lookupTerm: expression.lookupTerm ?? expression.term,
			}))
			.sort((left, right) => {
				const leftValue = left.lookupTerm?.toLocaleLowerCase() ?? "";
				const rightValue = right.lookupTerm?.toLocaleLowerCase() ?? "";
				const leftExact = leftValue === normalizedQuery;
				const rightExact = rightValue === normalizedQuery;
				if (leftExact !== rightExact) return leftExact ? -1 : 1;
				if (leftValue.length !== rightValue.length)
					return rightValue.length - leftValue.length;
				return sortSuggestions(left, right);
			})
			.slice(0, MAX_SUGGESTIONS);
	}

	private async suggestTemplates(
		macroName: string,
		query: string,
		req?: AutocompleteRequest,
	): Promise<AutocompleteSuggestion[]> {
		const macro = await this.deps.macros.get(macroName);
		if (!macro) return [];
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return (macro.authoringTemplates ?? [])
			.map((template) => {
				let literal = "";
				for (const part of template.parts) {
					if (part.kind === "slot") break;
					literal += part.text;
				}
				const slot = template.parts.find((p) => p.kind === "slot");
				const targetArgId =
					slot && slot.kind === "slot" ? slot.argumentId : undefined;
				return {
					label: literal,
					value: literal,
					type: "text" as const,
					detail: "template",
					source: "template" as const,
					argumentId: targetArgId,
				};
			})
			.filter((suggestion) => {
				if (!suggestion.value) return false;
				if (
					suggestion.argumentId &&
					req?.filledSlots?.includes(suggestion.argumentId)
				) {
					return false;
				}
				return suggestion.value.toLocaleLowerCase().startsWith(normalizedQuery);
			})
			.slice(0, MAX_SUGGESTIONS);
	}
}
