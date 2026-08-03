import { describe, expect, test } from "bun:test";
import type {
	MacroArgumentSpec,
	MacroChildDefinition,
	MacroDefinition,
} from "../src/macros/macro-definition";
import {
	type MacroValidationIssue,
	type MacroValidationResult,
	validateMacroDefinition,
} from "../src/macros/macro-validator";
import { observationSchema } from "../src/schemas/definitions";
import { SchemaRegistry } from "../src/schemas/schema-registry";

function buildRegistry(): SchemaRegistry {
	const registry = new SchemaRegistry();
	registry.register(observationSchema);
	return registry;
}

function baseMacro(
	overrides: Partial<MacroDefinition> = {},
): MacroDefinition {
	const args: MacroArgumentSpec[] = [
		{
			argumentId: "concept",
			name: "concept",
			roleName: "observation.concept",
			target: { targetSchema: "Observation", targetPath: "concept" },
			extraction: { kind: "concept", required: true },
			required: true,
		},
		{
			argumentId: "score",
			name: "score",
			roleName: "observation.severity.score",
			target: { targetSchema: "Observation", targetPath: "severity.score" },
			extraction: { kind: "scalar", required: true },
		},
	];
	return {
		macroId: "obs-v1",
		macroName: "observation",
		version: 1,
		status: "published",
		active: true,
		root: {
			roleName: "observation.root",
			targetSchema: "Observation",
			outputCellKind: "structured",
		},
		arguments: args,
		execution: { atomic: true },
		...overrides,
	};
}

function findIssue(
	result: MacroValidationResult,
	code: string,
): MacroValidationIssue | undefined {
	return result.issues.find((issue) => issue.code === code);
}

describe(" macro validator", () => {
	test("valid published macro passes without issues", () => {
		const registry = buildRegistry();
		const def = baseMacro();
		const result = validateMacroDefinition(def, registry);

		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	test("unknown schema emits UNKNOWN_SCHEMA error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			arguments: [
				{
					argumentId: "bad",
					name: "bad",
					roleName: "root",
					target: { targetSchema: "NonExistent", targetPath: "anything" },
					extraction: { kind: "scalar" },
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "UNKNOWN_SCHEMA");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(issue?.argumentId).toBe("bad");
		expect(result.valid).toBe(false);
	});

	test("invalid target path emits PATH_NOT_FOUND error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			arguments: [
				{
					argumentId: "x",
					name: "x",
					roleName: "root",
					target: { targetSchema: "Observation", targetPath: "doesNotExist" },
					extraction: { kind: "scalar" },
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "PATH_NOT_FOUND");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(issue?.path).toBe("doesNotExist");
		expect(result.valid).toBe(false);
	});

	test("missing execution policy on composite macro emits error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			root: {
				roleName: "observation.root",
				targetSchema: "Observation",
				outputCellKind: "macro_output",
			},
			execution: undefined,
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "MISSING_EXECUTION_POLICY");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(result.valid).toBe(false);
	});

	test("child with invalid merge strategy emits error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			children: [
				{
					childMacroName: "child1",
					parentRoleName: "observation.root",
					parentTargetPath: "severity",
					mergeStrategy:
						"invalid_strategy" as MacroChildDefinition["mergeStrategy"],
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "INVALID_MERGE_STRATEGY");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(result.valid).toBe(false);
	});

	test("required argument on optional field emits warning", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			arguments: [
				{
					argumentId: "certainty",
					name: "certainty",
					roleName: "observation.certainty",
					target: { targetSchema: "Observation", targetPath: "certainty" },
					extraction: { kind: "enum", required: true },
					required: true,
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "REQUIRED_BLANK_REJECT");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("warning");
		expect(issue?.argumentId).toBe("certainty");
		expect(result.valid).toBe(true);
	});

	test("draft status emits warning but still considered valid", () => {
		const registry = buildRegistry();
		const def = baseMacro({ status: "draft" });
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "DRAFT_STATUS");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("warning");
		expect(result.valid).toBe(true);
	});

	test("retired status emits warning but still considered valid", () => {
		const registry = buildRegistry();
		const def = baseMacro({ status: "retired" });
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "RETIRED_STATUS");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("warning");
		expect(result.valid).toBe(true);
	});

	test("duplicate argumentId emits error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			arguments: [
				{
					argumentId: "concept",
					name: "concept",
					roleName: "observation.concept",
					target: { targetSchema: "Observation", targetPath: "concept" },
					extraction: { kind: "concept" },
				},
				{
					argumentId: "concept",
					name: "concept2",
					roleName: "observation.concept2",
					target: { targetSchema: "Observation", targetPath: "concept" },
					extraction: { kind: "concept" },
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "DUPLICATE_ARGUMENT");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(result.valid).toBe(false);
	});

	test("value kind mismatch emits warning", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			arguments: [
				{
					argumentId: "source",
					name: "source",
					roleName: "observation.sourceType",
					target: { targetSchema: "Observation", targetPath: "sourceType" },
					extraction: { kind: "concept" },
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "VALUE_KIND_MISMATCH");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("warning");
		expect(issue?.argumentId).toBe("source");
		expect(result.valid).toBe(true);
	});

	test("cardinality mismatch emits warning for singular extraction on many field", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			arguments: [
				{
					argumentId: "dur",
					name: "dur",
					roleName: "observation.duration",
					target: { targetSchema: "Observation", targetPath: "duration" },
					extraction: { kind: "measurement" },
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "CARDINALITY_MISMATCH");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("warning");
		expect(issue?.argumentId).toBe("dur");
		expect(result.valid).toBe(true);
	});

	test("composition depth exceeded emits warning", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			execution: { atomic: true, maxCompositionDepth: 1 },
			children: [
				{
					childMacroName: "child1",
					parentRoleName: "observation.root",
					parentTargetPath: "severity",
					mergeStrategy: "replace",
				},
				{
					childMacroName: "child2",
					parentRoleName: "observation.root",
					parentTargetPath: "severity",
					mergeStrategy: "replace",
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "COMPOSITION_DEPTH_EXCEEDED");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("warning");
		expect(result.valid).toBe(true);
	});

	test("duplicate childMacroName emits error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			children: [
				{
					childMacroName: "child1",
					parentRoleName: "observation.root",
					parentTargetPath: "severity",
					mergeStrategy: "replace",
				},
				{
					childMacroName: "child1",
					parentRoleName: "observation.root",
					parentTargetPath: "severity",
					mergeStrategy: "replace",
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "CHILD_CYCLE");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(result.valid).toBe(false);
	});

	test("child with invalid parentTargetPath emits error", () => {
		const registry = buildRegistry();
		const def = baseMacro({
			children: [
				{
					childMacroName: "child1",
					parentRoleName: "observation.root",
					parentTargetPath: "noSuchPath",
					mergeStrategy: "replace",
				},
			],
		});
		const result = validateMacroDefinition(def, registry);

		const issue = findIssue(result, "PATH_NOT_FOUND");
		expect(issue).toBeDefined();
		expect(issue?.severity).toBe("error");
		expect(result.valid).toBe(false);
	});
});
