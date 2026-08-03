import { describe, expect, test } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { bindCommandMacro } from "../src/parser/command/command-macro-binder";
import { lexCommandMacro } from "../src/parser/command/command-macro-lexer";
import { KvParserCommandMacroStore } from "../src/store/parser/command-macros/kv-command-macro-store";
import { validateParserCommandMacro } from "../src/store/parser/command-macros/validation";
import { executeCommandMacroPlans } from "../src/engine/command-macro-executor";
import { executeCommandMacroGraph } from "../src/engine/command-macro-executor";
import { planCommandMacroBatch, validateMacroCompositionGraph } from "../src/parser/command/command-macro-graph";
import { getCommandMacroAutocomplete } from "../src/notebook/command-macro-autocomplete";
import { assignMacroSlot, renderCommandMacroTemplate } from "../src/parser/command/command-macro-authoring-template";
import { renderCommandMacroTargets } from "../src/parser/command/command-macro-renderer";
import { evaluateMacroBoundary, evaluateMacroEnvelope } from "../src/parser/command/command-macro-boundary";
import { CommandMacroQueryCompiler } from "../src/store/sql/command-macro-query-compiler";
import type { ParserCommandMacro } from "../src/store/parser/command-macros/interfaces";

const macro: ParserCommandMacro = {
	macroId: "cc-v1", macroName: "cc", version: 1, active: true,
	root: { roleName: "subjective.presenting_complaint", targetSchema: "ObservationEvent", cellPolicy: "create", outputCellKind: "structured" },
	arguments: [
		{ argumentId: "complaint", name: "complaint", roleName: "subjective.presenting_complaint", position: 0, target: { targetSchema: "ObservationEvent", targetPath: "concept" }, extraction: { kind: "concept", requireConceptFilter: true } },
		{ argumentId: "severity", name: "severity", roleName: "subjective.severity", position: 1, target: { targetSchema: "ObservationEvent", targetPath: "severity" }, extraction: { kind: "scalar", valueType: "integer", extraction: { pattern: "^\\d+$", fullSpan: true } } },
	],
};

describe("command macro v2 foundation", () => {
	test("lexes quoted, named, and grouped values without split semantics", () => {
		const result = lexCommandMacro('^cc complaint="air, problem" qualifiers=[one; two]');
		expect(result.macroName).toBe("cc");
		expect(result.arguments.map((token) => token.argumentId)).toEqual(["complaint", "qualifiers"]);
		expect(result.arguments[0]?.rawText).toBe("air, problem");
		expect(result.arguments[1]?.rawText).toBe("[one; two]");
	});

	test("binds direct operations and never creates ParsedItem", () => {
		const result = bindCommandMacro("^cc SOB 4", macro, { groupId: "g1", cellRef: "c1" });
		expect(result.diagnostics).toEqual([]);
		expect(result.plan?.operations).toHaveLength(2);
		expect(result.plan?.operations[1]?.targetPath).toBe("severity");
		expect(result.plan).not.toHaveProperty("parsedOutput");
	});

	test("rejects missing named groups and invalid full-span contracts", () => {
		const diagnostics = validateParserCommandMacro({ ...macro, arguments: [{ ...macro.arguments[1]!, extraction: { kind: "scalar", valueType: "integer", extraction: { pattern: "\\d+", fullSpan: true, namedGroupContract: { required: ["value"] } } } }] });
		expect(diagnostics.some((item) => item.message.includes("required named group"))).toBe(true);
		expect(diagnostics.some((item) => item.message.includes("anchored"))).toBe(true);
	});

	test("persists command macros separately from prose macros", async () => {
		const store = new KvParserCommandMacroStore(new MemoryKvBackend());
		await store.set(macro);
		expect(await store.get("cc")).toMatchObject({ macroId: "cc-v1", macroName: "cc" });
	});

	test("validates the full plan before mutation and compensates failures", async () => {
		const applied: string[] = [];
		const rolledBack: string[] = [];
		const result = await executeCommandMacroPlans([{ cellRef: "c", targetSchema: "ObservationEvent", operations: [
			{ operationId: "one", groupId: "g", cellRef: "c", targetSchema: "ObservationEvent", targetPath: "a", rawValue: "1", value: 1, sourceLine: 1, sourceArgument: 0, evidence: [] },
			{ operationId: "two", groupId: "g", cellRef: "c", targetSchema: "ObservationEvent", targetPath: "b", rawValue: "2", value: 2, sourceLine: 1, sourceArgument: 1, evidence: [] },
		] }], {
			apply: async (operation) => { applied.push(operation.operationId); if (operation.operationId === "two") throw new Error("write failed"); },
			rollback: async (operation) => { rolledBack.push(operation.operationId); },
		});
		expect(result.status).toBe("error");
		expect(applied).toEqual(["one", "two"]);
		expect(rolledBack).toEqual(["one"]);
	});

	test("orders macro autocomplete by prefix and short canonical name", async () => {
		const store = new KvParserCommandMacroStore(new MemoryKvBackend());
		await store.set({ ...macro, macroId: "cc-long", macroName: "cc-long" });
		await store.set({ ...macro, macroId: "cc", macroName: "cc" });
		const suggestions = await getCommandMacroAutocomplete("^cc", store);
		expect(suggestions.map((item) => item.verb)).toEqual(["^cc", "^cc-long"]);
	});

	test("uses structured slots and preserves bracket expressions as literals", () => {
		const rendered = renderCommandMacroTemplate({ version: 1, parts: [
			{ kind: "literal", text: "^cc expression=[__] duration=" },
			{ kind: "slot", slotId: "duration", occurrence: 0, displayText: "<duration>" },
		] });
		expect(rendered.text).toBe("^cc expression=[__] duration=<duration>");
		expect(rendered.slots[0]).toMatchObject({ slotId: "duration", status: "empty" });
	});

	test("rejects authoring slots that do not reference macro arguments", () => {
		const diagnostics = validateParserCommandMacro({ ...macro, authoringTemplate: { version: 1, parts: [{ kind: "slot", slotId: "custom-expression", occurrence: 0 }] } });
		expect(diagnostics.some((item) => item.message.includes("unknown argument"))).toBe(true);
	});

	test("advances structured slot state after an autocomplete assignment", () => {
		const template = { version: 1 as const, parts: [
			{ kind: "literal" as const, text: "^cc complaint=" },
			{ kind: "slot" as const, slotId: "complaint", occurrence: 0 },
			{ kind: "literal" as const, text: " duration=" },
			{ kind: "slot" as const, slotId: "duration", occurrence: 0 },
		] };
		const assignment = assignMacroSlot(template, new Map(), { slotId: "complaint", occurrence: 0 }, "SOB");
		expect(assignment.rendered.text).toBe("^cc complaint=SOB duration=<duration>");
		expect(assignment.activeSlot).toMatchObject({ slotId: "duration", status: "empty" });
	});

	test("renders canonical macro values with declarative conditionals", () => {
		const result = renderCommandMacroTargets({ version: 1, steps: [
			{ kind: "value", argumentId: "complaint" },
			{ kind: "conditional", when: { kind: "assigned", argumentId: "duration" }, then: [
				{ kind: "literal", text: " for " },
				{ kind: "value", argumentId: "duration", format: "display" },
			] },
		] }, { values: {
			complaint: { value: { display: "Shortness of breath" }, status: "assigned" },
			duration: { value: { value: 2, unit: "hours" }, status: "assigned" },
		} });
		expect(result.text).toBe("Shortness of breath for 2 hours");
		expect(result.status).toBe("resolved");
	});

	test("does not infer slots from visible placeholder text", () => {
		const result = renderCommandMacroTargets({ version: 1, steps: [{ kind: "literal", text: "custom expression [__]" }] }, { values: {} });
		expect(result.text).toBe("custom expression [__]");
	});

	test("plans explicit parent-child links and merge strategies", async () => {
		const parent: ParserCommandMacro = {
			...macro,
			macroId: "parent-v1",
			macroName: "parent",
			children: [{ childMacroName: "qualifier", parentRoleName: "subjective.presenting_complaint", parentTargetPath: "qualifiers", mergeStrategy: "append" }],
		};
		const child: ParserCommandMacro = {
			...macro,
			macroId: "qualifier-v1",
			macroName: "qualifier",
			arguments: [{ ...macro.arguments[0]!, argumentId: "qualifier", name: "qualifier", roleName: "subjective.presenting_complaint" }],
		};
		const store = new KvParserCommandMacroStore(new MemoryKvBackend());
		await store.set(parent);
		await store.set(child);
		const result = await planCommandMacroBatch("^parent SOB\n^qualifier diaphoresis", store, { groupId: "batch-1" });
		expect(result.diagnostics).toEqual([]);
		expect(result.graph?.links[0]).toMatchObject({ mergeStrategy: "append", parentTargetPath: "qualifiers" });
		expect(result.graph?.plans[1]?.parentRef).toBe(result.graph?.plans[0]?.cellRef);
	});

	test("rejects cyclic child composition before execution", () => {
		const a: ParserCommandMacro = { ...macro, macroName: "a", children: [{ childMacroName: "b", parentRoleName: "subjective.presenting_complaint", parentTargetPath: "child", mergeStrategy: "replace" }] };
		const b: ParserCommandMacro = { ...macro, macroName: "b", children: [{ childMacroName: "a", parentRoleName: "subjective.presenting_complaint", parentTargetPath: "child", mergeStrategy: "replace" }] };
		const diagnostics = validateMacroCompositionGraph(a, new Map([["a", a], ["b", b]]));
		expect(diagnostics.some((item) => item.includes("cyclic"))).toBe(true);
	});

	test("executes graph links after target operations and compensates both", async () => {
		const events: string[] = [];
		const result = await executeCommandMacroGraph({ plans: [{ cellRef: "p", targetSchema: "ObservationEvent", operations: [{ operationId: "write", groupId: "g", cellRef: "p", targetSchema: "ObservationEvent", targetPath: "concept", rawValue: "SOB", value: "SOB", sourceLine: 1, sourceArgument: 0, evidence: [] }] }], links: [{ linkId: "link", parentRef: "p", childRef: "c", parentRoleName: "subjective.presenting_complaint", parentTargetPath: "qualifiers", mergeStrategy: "append", sourceLine: 2 }] }, {
			apply: async () => { events.push("write"); },
			applyLink: async () => { events.push("link"); throw new Error("link failed"); },
			rollback: async () => { events.push("rollback-write"); },
		});
		expect(result.status).toBe("error");
		expect(events).toEqual(["write", "link", "rollback-write"]);
	});

	test("enforces macro envelopes and reports boundary evidence", () => {
		const envelope = evaluateMacroEnvelope("^cc SOB one two three four", 3, { maxWords: 2 });
		expect(envelope.accepted).toBe(false);
		expect(envelope.reasons[0]).toContain("word distance");
		const local = evaluateMacroBoundary("shoulder pain on the right", { start: 20, end: 25 }, { start: 0, end: 7 }, { direction: "right", maxWords: 4, unit: "words" });
		expect(local.accepted).toBe(true);
	});

	test("keeps a macro from consuming a distant paragraph", () => {
		const bounded: ParserCommandMacro = { ...macro, boundary: { maxParagraphs: 0, maxWords: 8 } };
		const result = lexCommandMacro("^cc SOB\n\nfar away prose that must not be consumed", bounded);
		expect(result.diagnostics.some((item) => item.message.includes("macro envelope"))).toBe(true);
	});

	test("compiles command macro DDL and context-aware queries", () => {
		const compiler = new CommandMacroQueryCompiler("sqlite");
		const ddl = compiler.getTableDDL("parser_command_macros")[0]!;
		const query = compiler.compileGetQuery("cc", "parser_command_macros", { personnelId: "p1", profileId: "profile" });
		expect(ddl.sql).toContain("CREATE TABLE IF NOT EXISTS");
		expect(ddl.sql).toContain("definition");
		expect(query.sql).toContain("macroName");
		expect(query.sql).toContain("personnelId");
		expect(query.params).toContain("cc");
		expect(query.params).toContain("p1");
		expect(query.params).toContain("profile");
	});
});
