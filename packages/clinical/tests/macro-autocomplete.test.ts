import { describe, expect, test } from "bun:test";
import type { Concept } from "@stateful-mcp/core/middleware/dictionary/types";
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
					root: { roleName: "obs", targetSchema: "Obs", outputCellKind: "structured" },
					arguments: [
						{
							argumentId: "a1",
							name: "severity",
							roleName: "obs.severity",
							target: { targetSchema: "Obs", targetPath: "severity" },
							extraction: {
								kind: "enum",
								patterns: ["mild", "moderate", "severe"]
							}
						}
					]
				}
			];
			const service = new MacroAutocomplete({ macros: makeMacroStore(macros) });
			const results = await service.suggest({
				query: "mi",
				macroName: "obs",
				argumentName: "severity"
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
					root: { roleName: "obs", targetSchema: "Obs", outputCellKind: "structured" },
					arguments: [
						{
							argumentId: "a1",
							name: "level",
							roleName: "obs.level",
							target: { targetSchema: "Obs", targetPath: "level" },
							extraction: {
								kind: "scalar",
								numericBounds: { min: 2, max: 8, step: 2 }
							}
						}
					]
				}
			];
			const service = new MacroAutocomplete({ macros: makeMacroStore(macros) });
			const results = await service.suggest({
				query: "4",
				macroName: "obs",
				argumentName: "level"
			});
			expect(results).toHaveLength(1);
			expect(results[0].value).toBe("4");
		});

		test("supports direct concept search with # prefix and namespace parsing", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(SAMPLE_CONCEPTS),
			});
			const results = await service.suggest({
				query: "#snomed:che",
			});
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.type === "concept")).toBe(true);
		});

		test("supports expression search override with @ prefix", async () => {
			const service = new MacroAutocomplete({
				macros: makeMacroStore(SAMPLE_MACROS),
				dictionary: makeDictionary(SAMPLE_CONCEPTS),
			});
			const results = await service.suggest({
				query: "@che",
			});
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.type === "concept")).toBe(true);
		});
	});
});
