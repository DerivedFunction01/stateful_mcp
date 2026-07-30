import { describe, expect, it } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import { MacroExpander } from "../src/parser/macro-expander";
import { KvParserMacroStore } from "../src/store/parser/macros/kv-macro-store";

describe("MacroExpander", () => {
	const defaultProfile = { macroStartToken: "^" };

	it("should expand a simple macro without arguments", async () => {
		const store = new KvParserMacroStore(new MemoryKvBackend());
		await store.set({
			macroId: "m1",
			macroName: "fever_macro",
			macroTemplate: "Fever; certainty: confirmed",
		});

		const result = await MacroExpander.expand(
			"^fever_macro",
			store,
			defaultProfile,
		);
		expect(result).toBe("Fever; certainty: confirmed");
	});

	it("should expand a macro with arguments substituted into $1, $2", async () => {
		const store = new KvParserMacroStore(new MemoryKvBackend());
		await store.set({
			macroId: "m2",
			macroName: "sob_macro",
			macroTemplate: "shortness of breath; severity: $1/10; duration: $2 days",
		});

		const result = await MacroExpander.expand(
			"^sob_macro(8, 3)",
			store,
			defaultProfile,
		);
		expect(result).toBe(
			"shortness of breath; severity: 8/10; duration: 3 days",
		);
	});

	it("should support nested recursive macro expansions", async () => {
		const store = new KvParserMacroStore(new MemoryKvBackend());
		await store.set({
			macroId: "child",
			macroName: "child_macro",
			macroTemplate: "Fever; severity: $1",
		});
		await store.set({
			macroId: "parent",
			macroName: "parent_macro",
			macroTemplate: "^child_macro($1) w. cough",
		});

		const result = await MacroExpander.expand(
			"^parent_macro(high)",
			store,
			defaultProfile,
		);
		expect(result).toBe("Fever; severity: high w. cough");
	});

	it("should support passing a macro call as an argument to another macro", async () => {
		const store = new KvParserMacroStore(new MemoryKvBackend());
		await store.set({
			macroId: "child",
			macroName: "child_macro",
			macroTemplate: "cough for $1 days",
		});
		await store.set({
			macroId: "parent",
			macroName: "parent_macro",
			macroTemplate: "Patient presents with $1",
		});

		const result = await MacroExpander.expand(
			"^parent_macro(^child_macro(3))",
			store,
			defaultProfile,
		);
		expect(result).toBe("Patient presents with cough for 3 days");
	});

	it("should support custom macro delimiters (e.g. brace or pipe syntax)", async () => {
		const store = new KvParserMacroStore(new MemoryKvBackend());
		await store.set({
			macroId: "m3",
			macroName: "sob_custom",
			macroTemplate: "SOB; severity: $1/10, duration: $2h",
		});

		// Brace syntax: ^sob_custom{8,2}
		const braceProfile = {
			macroStartToken: "^",
			macroArgStartToken: "{",
			macroArgEndToken: "}",
			macroArgDelimiter: ",",
		};
		const resultBrace = await MacroExpander.expand(
			"^sob_custom{8,2}",
			store,
			braceProfile,
		);
		expect(resultBrace).toBe("SOB; severity: 8/10, duration: 2h");

		// Pipe syntax: ^sob_custom|8;2|
		const pipeProfile = {
			macroStartToken: "^",
			macroArgStartToken: "|",
			macroArgEndToken: "|",
			macroArgDelimiter: ";",
		};
		const resultPipe = await MacroExpander.expand(
			"^sob_custom|8;2|",
			store,
			pipeProfile,
		);
		expect(resultPipe).toBe("SOB; severity: 8/10, duration: 2h");
	});

	it("should throw an error on infinite recursion circular macros", async () => {
		const store = new KvParserMacroStore(new MemoryKvBackend());
		await store.set({
			macroId: "loop1",
			macroName: "loop_a",
			macroTemplate: "^loop_b",
		});
		await store.set({
			macroId: "loop2",
			macroName: "loop_b",
			macroTemplate: "^loop_a",
		});

		expect(() =>
			MacroExpander.expand("^loop_a", store, defaultProfile, 5),
		).toThrow();
	});
});

describe("CdslParser Integration with MacroExpander", () => {
	const mockProfile = {
		profileId: "test_profile",
		personnelId: "test_doc",
		tagToken: "#",
		stateDelimiter: "||",
		stateStartDelimiter: "|",
		stateEndDelimiter: "|",
		macroStartToken: "^",
		variableStartToken: "{",
		variableEndToken: "}",
		isDefault: true,
		termTokenizer: "::",
		schemaNamespaces: {
			observationevent: ["SNOMED"],
		},
		attributeRules: [],
	} as any;

	it("should parse expanded macros in CdslParser", async () => {
		const ds = new DictionaryStore(
			new InMemoryConceptResolver(),
			createMemoryConceptStore(),
			createMemoryExpressionStore(),
		);

		const conceptStore = (ds as any)["conceptStore"];
		await conceptStore.addNamespace({
			code: "SNOMED",
			description: "SNOMED",
			isPublic: true,
			isExternalPrivate: false,
		});
		await conceptStore.addConcept({
			id: "SNOMED::29857009",
			standardCode: "29857009",
			display: "Chest Pain",
			namespaceCode: "SNOMED",
			active: true,
		});

		await ds.addExpression({
			term: "Chest Pain",
			regexPattern: "\\bchest pain\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
			id: "chest-pain-exp",
		});

		const macroStore = new KvParserMacroStore(new MemoryKvBackend());
		await macroStore.set({
			macroId: "m-sob",
			macroName: "severe_sob",
			macroTemplate: "#ObservationEvent Chest Pain denies", // Renders refuted observation
		});

		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: mockProfile,
			macroStore,
		});
		const results = await parser.parse("^severe_sob");

		expect(results.length).toBe(1);
		const first = results[0];
		expect(first).toBeDefined();
		if (first) {
			expect(first.targetSchema).toBe("ObservationEvent");
			expect(first.concept?.[0]?.display).toBe("Chest Pain");
		}
	});
});
