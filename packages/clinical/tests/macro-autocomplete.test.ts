import { describe, expect, test } from "bun:test";
import type {
	Concept,
	CustomExpression,
} from "@stateful-mcp/core/middleware/dictionary/types";
import type { MacroLearningService } from "../src/learning/macro-learning-service";
import { NOTE_MACRO } from "../src/bootstrap/default-macros";
import { MacroAutocomplete } from "../src/macros/macro-autocomplete";
import type {
	MacroDefinition,
	MacroStore,
} from "../src/macros/macro-definition";
import type { ConceptLookup } from "../src/values/concept-value";

function makeMacroStore(macros: MacroDefinition[]): MacroStore {
	return {
		async list() {
			return macros;
		},
		async get(name: string) {
			return macros.find((m) => m.macroName === name) ?? null;
		},
	};
}

function makeDictionary(concepts: Concept[]): ConceptLookup {
	return {
		async search(_query: string, _namespaceCode?: string, _limit?: number) {
			return concepts;
		},
	};
}

function makeExpressionDictionary(
	concepts: Concept[],
	expressions: CustomExpression[],
): ConceptLookup {
	return {
		async search(_query: string, _namespaceCode?: string, _limit?: number) {
			return concepts;
		},
		async searchExpressionCandidates(request) {
			return expressions.filter((expression) =>
				(expression.lookupTerm ?? expression.term).startsWith(
					request.lookupPrefix ?? "",
				),
			);
		},
	};
}

const SAMPLE_MACROS: MacroDefinition[] = [
	{
		macroId: "m1",
		macroName: "observation",
		version: 1,
		status: "published",
		active: true,
		root: {
			roleName: "observation",
			targetSchema: "ObservationEvent",
			outputCellKind: "structured",
		},
		arguments: [
			{
				argumentId: "a1",
				name: "concept",
				aliases: ["c"],
				roleName: "observation.concept",
				position: 0,
				target: { targetSchema: "ObservationEvent", targetPath: "concept" },
				extraction: { kind: "concept" },
			},
			{
				argumentId: "a2",
				name: "status",
				roleName: "observation.status",
				position: 1,
				target: { targetSchema: "ObservationEvent", targetPath: "status" },
				extraction: { kind: "enum" },
			},
		],
	},
	{
		macroId: "m2",
		macroName: "obs",
		version: 1,
		status: "published",
		active: true,
		root: {
			roleName: "observation",
			targetSchema: "ObservationEvent",
			outputCellKind: "structured",
		},
		arguments: [],
	},
	{
		macroId: "m3",
		macroName: "observation_set",
		version: 1,
		status: "published",
		active: true,
		root: {
			roleName: "observation",
			targetSchema: "ObservationEvent",
			outputCellKind: "structured",
		},
		arguments: [],
	},
];

const SAMPLE_CONCEPTS: Concept[] = [
	{
		id: "c1",
		namespaceCode: "snomed",
		standardCode: "12345",
		display: "Chest pain",
		active: true,
	},
	{
		id: "c2",
		namespaceCode: "snomed",
		standardCode: "67890",
		display: "Chest infection",
		active: true,
	},
	{
		id: "c3",
		namespaceCode: "icd10",
		standardCode: "J18",
		display: "Pneumonia",
		active: true,
	},
	{
		id: "c4",
		namespaceCode: "snomed",
		standardCode: "99999",
		display: "Inactive concept",
		active: false,
	},
];

describe("MacroAutocomplete", () => {
	describe("macro name suggestions", () => {
		test("returns macro names matching prefix after ^, sorted alphabetically, capped at 10", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({ query: "^obs", scope: "macro" });

			expect(results).toHaveLength(3);
			expect(results.map((r) => r.value)).toEqual([
				"obs",
				"observation",
				"observation_set",
			]);
		});

		test("is case-insensitive", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({ query: "^OBS", scope: "macro" });

			expect(results).toHaveLength(3);
			expect(results.map((r) => r.value)).toEqual([
				"obs",
				"observation",
				"observation_set",
			]);
		});

		test("returns empty array for unmatched prefix", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({ query: "^xyz", scope: "macro" });

			expect(results).toEqual([]);
		});

		test("returns [] for empty query", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({ query: "" });

			expect(results).toEqual([]);
		});
	});

	describe("argument name suggestions", () => {
		test("returns argument names matching prefix within a macro", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "con",
				scope: "argument",
				macroName: "observation",
			});

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				label: "concept",
				value: "concept",
				type: "argument",
				detail: "observation.concept",
			});
		});

		test("matches by alias", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "c",
				scope: "argument",
				macroName: "observation",
			});

			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("concept");
		});

		test("exposes bounded learning evidence when ranking is available", async () => {
			const learningService = {
				async rankCandidates() {
					return [
						{
							candidate: { argumentId: "a1" },
							score: 0.86,
							features: { transition: 0.8, numericFit: 0.1 },
							evidence: {
								observationCount: 24,
								scope: "personal" as const,
								observationMode: "live" as const,
								featureKeys: ["argument.kind"],
							},
						},
					];
				},
			} as unknown as MacroLearningService;
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				learningService,
			});
			const result = await service.suggest({
				query: "con",
				scope: "argument",
				macroName: "observation",
				macroId: "m1",
				macroVersion: 1,
			});

			expect(result[0]?.macro?.evidence).toEqual({
				score: 0.86,
				observationCount: 24,
				scope: "personal",
				observationMode: "live",
				reason: "transition",
				featureKeys: ["argument.kind"],
			});
		});

		test("matches by roleName prefix", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "stat",
				scope: "argument",
				macroName: "observation",
			});

			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("status");
		});

		test("returns empty array for unknown macro", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "con",
				scope: "argument",
				macroName: "nonexistent",
			});

			expect(results).toEqual([]);
		});
	});

	describe("enum suggestions", () => {
		test("filters and sorts provided enumValues", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "a",
				scope: "enum",
				enumValues: ["present", "partial", "absent", "resolved"],
			});

			expect(results).toHaveLength(2);
			expect(results.map((r) => r.value)).toEqual(["absent", "partial"]);
			expect(results.every((r) => r.type === "enum")).toBe(true);
		});

		test("returns empty array when enumValues not provided", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "pr",
				scope: "enum",
			});

			expect(results).toEqual([]);
		});
	});

	describe("concept suggestions", () => {
		test("searches dictionary and maps to namespace::code format", async () => {
			const lowerQuery = "che";
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(
					SAMPLE_CONCEPTS.filter(
						(c) =>
							c.active !== false &&
							c.display.toLowerCase().startsWith(lowerQuery),
					),
				),
			});

			const results = await service.suggest({
				query: "che",
				scope: "concept",
				namespaceCode: "snomed",
			});

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				label: "Chest infection",
				value: "snomed::67890",
				type: "concept",
				detail: "67890",
			});
			expect(results[1]).toEqual({
				label: "Chest pain",
				value: "snomed::12345",
				type: "concept",
				detail: "12345",
			});
		});

		test("filters out inactive concepts", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(SAMPLE_CONCEPTS),
			});

			const results = await service.suggest({
				query: "Ina",
				scope: "concept",
			});

			expect(results).toEqual([]);
		});

		test("returns empty array when dictionary is missing", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({
				query: "che",
				scope: "concept",
			});

			expect(results).toEqual([]);
		});

		test("passes namespaceCode through to dictionary.search", async () => {
			const capturedQueries: Array<{ query: string; namespaceCode?: string }> =
				[];
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: {
					async search(query: string, namespaceCode?: string) {
						capturedQueries.push({ query, namespaceCode });
						return SAMPLE_CONCEPTS.filter((c) => c.active !== false);
					},
				},
			});

			await service.suggest({
				query: "che",
				scope: "concept",
				namespaceCode: "snomed",
			});

			expect(capturedQueries).toHaveLength(1);
			expect(capturedQueries[0]!.namespaceCode).toBe("snomed");
		});
	});

	describe("default scope inference", () => {
		test("defaults to macro suggestions when query starts with ^", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({ query: "^obs" });

			expect(results).toHaveLength(3);
			expect(results.every((r) => r.type === "macro")).toBe(true);
		});

		test("returns empty array for non-^ query without explicit scope", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
			});

			const results = await service.suggest({ query: "che" });

			expect(results).toEqual([]);
		});
	});

	describe("Upgraded Autocomplete Features", () => {
		test("suggests enum values from extraction patterns for enum argument", async () => {
			const macros: MacroDefinition[] = [
				{
					macroId: "m1",
					macroName: "obs",
					version: 1,
					status: "published",
					active: true,
					root: {
						roleName: "obs",
						targetSchema: "Obs",
						outputCellKind: "structured",
					},
					arguments: [
						{
							argumentId: "a1",
							name: "severity",
							roleName: "obs.severity",
							target: { targetSchema: "Obs", targetPath: "severity" },
							extraction: {
								kind: "enum",
								patterns: ["mild", "moderate", "severe"],
							},
						},
					],
				},
			];
			const service = new MacroAutocomplete({ macros: makeMacroStore(macros) });
			const results = await service.suggest({
				query: "mi",
				macroName: "obs",
				argumentName: "severity",
			});
			expect(results).toHaveLength(1);
			expect(results[0].value).toBe("mild");
		});

		test("suggests numeric range values with step level", async () => {
			const macros: MacroDefinition[] = [
				{
					macroId: "m1",
					macroName: "obs",
					version: 1,
					status: "published",
					active: true,
					root: {
						roleName: "obs",
						targetSchema: "Obs",
						outputCellKind: "structured",
					},
					arguments: [
						{
							argumentId: "a1",
							name: "level",
							roleName: "obs.level",
							target: { targetSchema: "Obs", targetPath: "level" },
							extraction: {
								kind: "scalar",
								numericBounds: { min: 2, max: 8, step: 2 },
							},
						},
					],
				},
			];
			const service = new MacroAutocomplete({ macros: makeMacroStore(macros) });
			const results = await service.suggest({
				query: "4",
				macroName: "obs",
				argumentName: "level",
			});
			expect(results).toHaveLength(1);
			expect(results[0].value).toBe("4");
		});

		test("does not use # custom-expression prefix for concept search", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(SAMPLE_CONCEPTS),
				conceptToken: "@",
			});
			const results = await service.suggest({
				query: "#snomed:che",
			});
			expect(results).toEqual([]);
		});

		test("supports expression search override with @ prefix", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(SAMPLE_CONCEPTS),
				conceptToken: "@",
			});
			const results = await service.suggest({
				query: "@che",
			});
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.type === "concept")).toBe(true);
		});

		test("uses the configured concept token and its full length", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(SAMPLE_CONCEPTS),
				conceptToken: "concept:",
			});
			const results = await service.suggest({ query: "concept:che" });
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.type === "concept")).toBe(true);
		});

		test("suggests only bounded custom expressions for natural concept input", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeExpressionDictionary(SAMPLE_CONCEPTS, [
					{
						id: "expr-1",
						term: "shortness of breath",
						lookupTerm: "sob",
						regexPattern: "\\bsob\\b",
						isCaseInsensitive: true,
						conceptId: "c1",
						priorityWeight: 1,
						active: true,
					},
					{
						id: "expr-unbound",
						term: "unbound",
						lookupTerm: "unbound",
						regexPattern: "\\bunbound\\b",
						isCaseInsensitive: true,
						priorityWeight: 1,
						active: true,
					},
				]),
			});
			const results = await service.suggest({
				query: "sob",
				macroName: "observation",
				argumentName: "concept",
			});
			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({
				label: "shortness of breath",
				value: "sob",
				expressionId: "expr-1",
				conceptId: "c1",
				source: "custom-expression",
			});
		});

		test("uses a configured namespace separator instead of colon", async () => {
			let receivedNamespace: string | undefined;
			let receivedQuery = "";
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				conceptToken: "@",
				conceptCodeSeparator: "|",
				dictionary: {
					async search(query, namespaceCode) {
						receivedQuery = query;
						receivedNamespace = namespaceCode;
						return SAMPLE_CONCEPTS;
					},
				},
			});
			await service.suggest({ query: "@ICD-10|R.18" });
			expect(receivedNamespace).toBe("ICD-10");
			expect(receivedQuery).toBe("R.18");
		});

		test("ranks overlapping expressions by exactness then specificity", async () => {
			const expressions: CustomExpression[] = [
				{
					id: "short",
					term: "Harry Potter",
					lookupTerm: "harry potter",
					regexPattern: "harry potter",
					isCaseInsensitive: true,
					conceptId: "short-concept",
					priorityWeight: 1,
					active: true,
				},
				{
					id: "long",
					term: "Harry Potter and the Deathly Hallows",
					lookupTerm: "harry potter and the deathly hallows",
					regexPattern: "harry potter and the deathly hallows",
					isCaseInsensitive: true,
					conceptId: "long-concept",
					priorityWeight: 1,
					active: true,
				},
			];
			const service = new MacroAutocomplete({
				macros: makeMacroStore([NOTE_MACRO]),
				dictionary: makeExpressionDictionary([], expressions),
			});
			const prefix = await service.suggest({
				query: "harry p",
				macroName: "note",
				argumentName: "title",
			});
			expect(prefix.map((suggestion) => suggestion.lookupTerm)).toEqual([
				"harry potter and the deathly hallows",
				"harry potter",
			]);
			const exact = await service.suggest({
				query: "harry potter",
				macroName: "note",
				argumentName: "title",
			});
			expect(exact[0]?.lookupTerm).toBe("harry potter");
		});

		test("does not route lookup tokens from non-concept arguments", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore([NOTE_MACRO]),
				expressionToken: "#",
				dictionary: makeExpressionDictionary(
					[],
					[
						{
							id: "expr-hp",
							term: "Harry Potter",
							lookupTerm: "hp",
							regexPattern: "\\bhp\\b",
							isCaseInsensitive: true,
							conceptId: "c-hp",
							priorityWeight: 1,
							active: true,
						},
					],
				),
			});

			expect(
				await service.suggest({
					query: "#hp",
					macroName: "note",
					argumentName: "page_num",
				}),
			).toEqual([]);
		});

		test("combines template and expression candidates for a shared prefix", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore([NOTE_MACRO]),
				dictionary: makeExpressionDictionary(
					[],
					[
						{
							id: "expr-hp",
							term: "Harry Potter",
							lookupTerm: "hp",
							regexPattern: "\\bhp\\b",
							isCaseInsensitive: true,
							conceptId: "c-hp",
							priorityWeight: 1,
							active: true,
						},
					],
				),
			});
			const expressions = await service.suggest({
				query: "h",
				macroName: "note",
				argumentName: "title",
			});
			const templates = await service.suggest({
				query: "h",
				scope: "template",
				macroName: "note",
			});

			expect(expressions[0]?.lookupTerm).toBe("hp");
			expect(templates[0]).toMatchObject({
				value: "has page # ",
				source: "template",
			});
		});

		test("matches configured expression tokens case-insensitively", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore([NOTE_MACRO]),
				expressionToken: "#",
				dictionary: makeExpressionDictionary(
					[],
					[
						{
							id: "expr-hp",
							term: "Harry Potter",
							lookupTerm: "hp",
							regexPattern: "\\bhp\\b",
							isCaseInsensitive: true,
							conceptId: "c-hp",
							priorityWeight: 1,
							active: true,
						},
					],
				),
			});
			const results = await service.suggest({
				query: "#H",
				macroName: "note",
				argumentName: "title",
			});
			expect(results[0]?.lookupTerm).toBe("hp");
		});
	});
});
