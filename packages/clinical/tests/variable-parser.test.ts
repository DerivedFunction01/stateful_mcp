import { describe, expect, it } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryVariableStore,
	VariableServiceStore,
} from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import { CdslVariableParser } from "../src/parser/variable-parser";

const defaultProfile = {
	variableStartToken: "{",
	variableEndToken: "}",
	variableDelimiter: ",",
};

describe("CdslVariableParser", () => {
	it("should parse and apply assignments to the variable service", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);
		const text = "Patient state {x=10, y=true, name='female'}";

		const cleanText = await CdslVariableParser.parseAndApply(
			text,
			service,
			"session-1",
			defaultProfile,
		);

		expect(cleanText).toBe("Patient state ");
		expect(await service.getVariable("session-1", "x")).toBe(10);
		expect(await service.getVariable("session-1", "y")).toBe(true);
		expect(await service.getVariable("session-1", "name")).toBe("female");
	});

	it("should pass when assertion check is satisfied", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);
		await service.setVariable("session-2", "z", 42);

		const text = "{z > 40, z <= 42, z == 42}";
		const cleanText = await CdslVariableParser.parseAndApply(
			text,
			service,
			"session-2",
			defaultProfile,
		);

		expect(cleanText).toBe("");
	});

	it("should throw error when assertion check is violated", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);
		await service.setVariable("session-3", "z", 42);

		const text = "{z < 40}";
		expect(() =>
			CdslVariableParser.parseAndApply(
				text,
				service,
				"session-3",
				defaultProfile,
			),
		).toThrow("Variable assertion failed");
	});

	it("should isolate block-scoped variables and support prefixes", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);
		const text = "person{age=30, status='active'}";

		const cleanText = await CdslVariableParser.parseAndApply(
			text,
			service,
			"session-4",
			defaultProfile,
		);

		expect(cleanText).toBe("");
		// Age is stored under block-scope 'person', not global scope
		expect(await service.getVariable("session-4", "age")).toBeUndefined();
		expect(await service.getVariable("session-4", "age", "person")).toBe(30);

		// Assertions inside block context
		const assertText = "person{age >= 30}";
		const res = await CdslVariableParser.parseAndApply(
			assertText,
			service,
			"session-4",
			defaultProfile,
		);
		expect(res).toBe("");
	});

	it("should support set-membership check (->)", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);
		await service.setVariable("session-5", "status", "active");

		const text =
			"{status -> {active, pending}, status !-> {completed, cancelled}}";
		const cleanText = await CdslVariableParser.parseAndApply(
			text,
			service,
			"session-5",
			defaultProfile,
		);
		expect(cleanText).toBe("");
	});

	it("should shadow-read variables from parent branch but shadow write locally", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		// Parent branch variables
		await service.setVariable("session-6/main", "global_val", "active");
		await service.setVariable("session-6/main", "local_shadow", "parent_value");

		// Child branch parses a note asserting global_val (reaches parent) and shadow-writing local_shadow
		const text =
			"{global_val == active, local_shadow = child_value, local_shadow == child_value}";
		const cleanText = await CdslVariableParser.parseAndApply(
			text,
			service,
			"session-6/main/child",
			defaultProfile,
		);

		expect(cleanText).toBe("");

		// Verifying local shadow is child_value, parent remains parent_value
		expect(
			await service.getVariable("session-6/main/child", "local_shadow"),
		).toBe("child_value");
		expect(await service.getVariable("session-6/main", "local_shadow")).toBe(
			"parent_value",
		);
	});
});

describe("CdslParser Integration with CdslVariableParser", () => {
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

	it("should process assignments and assertions during CdslParser parse", async () => {
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

		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const parser = new CdslParser(
			ds,
			mockProfile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			service,
		);

		// Initialize variable value, then run input containing an assertion check on it alongside parsed clinical note text
		await service.setVariable("default_session", "age", 45);
		const results = await parser.parse(
			"{age > 40} #ObservationEvent Chest Pain",
		);

		expect(results.length).toBe(1);
		const first = results[0];
		expect(first).toBeDefined();
		if (first) {
			expect(first.targetSchema).toBe("ObservationEvent");
			expect(first.concept?.[0]?.display).toBe("Chest Pain");
		}
	});

	it("should fail parsing if inline variable assertions fail", async () => {
		const ds = new DictionaryStore(
			new InMemoryConceptResolver(),
			createMemoryConceptStore(),
			createMemoryExpressionStore(),
		);
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const parser = new CdslParser(
			ds,
			mockProfile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			service,
		);

		await service.setVariable("default_session", "age", 30);
		expect(() =>
			parser.parse("{age > 40} #ObservationEvent Chest Pain"),
		).toThrow("Variable assertion failed");
	});

	it("should parse and resolve clinical concepts during variable assignment", async () => {
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

		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const parser = new CdslParser(
			ds,
			mockProfile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			service,
		);

		await parser.parse("{prob_concept = @Chest Pain}");
		const val = await service.getVariable("default_session", "prob_concept");
		expect(val).toBeDefined();
		expect((val as any)?.display).toBe("Chest Pain");
		expect((val as any)?.conceptId).toBe("SNOMED::29857009");
	});

	it("should evaluate synonym concept variables as equal if they map to the same concept", async () => {
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

		// User A expression mapping
		await ds.addExpression({
			term: "Chest Pain",
			regexPattern: "\\bchest pain\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
			id: "chest-pain-exp-a",
		});

		// User B synonym expression mapping ("angina pectoris" mapping to same SNOMED ID)
		await ds.addExpression({
			term: "Angina Pectoris",
			regexPattern: "\\bangina pectoris\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
			id: "chest-pain-exp-b",
		});

		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const parser = new CdslParser(
			ds,
			mockProfile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			service,
		);

		// User A sets variable with one phrase, User B asserts variable with another phrase
		await parser.parse("{prob_concept = @Chest Pain}");
		const cleanText = await parser.parse("{prob_concept == @Angina Pectoris}");
		expect(cleanText.length).toBe(0);
	});

	it("should support canonical variable commands (/set, /assert, /eval) outside of brackets", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		// 1. /set command sets global and block scope variables
		const text1 = "/set x = 42\n/set personnel{role = doctor}";
		const cleanText1 = await CdslVariableParser.parseAndApply(
			text1,
			service,
			"session-cmd",
			defaultProfile,
		);
		expect(cleanText1.trim()).toBe("");
		expect(await service.getVariable("session-cmd", "x")).toBe(42);
		expect(await service.getVariable("session-cmd", "role", "personnel")).toBe(
			"doctor",
		);

		// 2. /assert command executes comparison validations
		const text2 = "/assert x > 40\n/assert personnel{role == doctor}";
		const cleanText2 = await CdslVariableParser.parseAndApply(
			text2,
			service,
			"session-cmd",
			defaultProfile,
		);
		expect(cleanText2.trim()).toBe("");

		// 3. /eval command treats '=' as equality comparison (assert mode)
		const text3 = "/eval x = 42";
		const cleanText3 = await CdslVariableParser.parseAndApply(
			text3,
			service,
			"session-cmd",
			defaultProfile,
		);
		expect(cleanText3.trim()).toBe("");

		// 4. Violation of /assert should throw
		const text4 = "/assert x < 20";
		expect(() =>
			CdslVariableParser.parseAndApply(
				text4,
				service,
				"session-cmd",
				defaultProfile,
			),
		).toThrow("Variable assertion failed");
	});

	it("should support natural localized command verb mappings", async () => {
		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const frenchProfile = {
			variableStartToken: "{",
			variableEndToken: "}",
			variableDelimiter: ",",
			commandMappings: {
				definir: "set" as const,
				verifier: "assert" as const,
			},
		};

		const text = "/definir temp = 37.5\n/verifier temp > 37";
		const cleanText = await CdslVariableParser.parseAndApply(
			text,
			service,
			"session-fr",
			frenchProfile,
		);

		expect(cleanText.trim()).toBe("");
		expect(await service.getVariable("session-fr", "temp")).toBe(37.5);
	});

	it("should skip invalid/unknown slash commands so they are parsed downstream", async () => {
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
			id: "chest-pain-exp-c",
		});

		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const parser = new CdslParser(
			ds,
			mockProfile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			service,
		);

		// "/unknown" is not a command, so it should fall through and get parsed as "Chest Pain"
		const results = await parser.parse("/unknown #ObservationEvent Chest Pain");

		expect(results.length).toBe(1);
		const first = results[0];
		expect(first).toBeDefined();
		if (first) {
			expect(first.targetSchema).toBe("ObservationEvent");
			expect(first.concept?.[0]?.display).toBe("Chest Pain");
		}
	});

	it("should parse segments with trailing or RTL-friendly tags anywhere in the text", async () => {
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
			id: "chest-pain-exp-rtl",
		});

		const store = new MemoryVariableStore();
		const service = new VariableServiceStore(store);

		const parser = new CdslParser(
			ds,
			mockProfile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			service,
		);

		// Tag at the end of the note line (trailing / RTL style)
		const results = await parser.parse("Chest Pain #ObservationEvent");

		expect(results.length).toBe(1);
		const first = results[0];
		expect(first).toBeDefined();
		if (first) {
			expect(first.targetSchema).toBe("ObservationEvent");
			expect(first.concept?.[0]?.display).toBe("Chest Pain");
		}
	});
});
