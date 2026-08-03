import { describe, expect, it } from "bun:test";
import { bindMacro } from "../src/v2/macros/macro-binder";
import { MacroCompiler } from "../src/v2/macros/macro-compiler";
import type { V2MacroDefinition } from "../src/v2/macros/macro-definition";
import { parseMacroLine } from "../src/v2/macros/macro-input-parser";
import { renderMacroPreview } from "../src/v2/macros/macro-renderer";
import { observationSchema } from "../src/v2/schemas/definitions";
import { SchemaRegistry } from "../src/v2/schemas/schema-registry";

const OBSERVATION_MACRO: V2MacroDefinition = {
	macroId: "m_obs_1",
	macroName: "observation",
	version: 1,
	status: "published",
	active: true,
	root: {
		roleName: "observation",
		targetSchema: "Observation",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "concept",
			name: "concept",
			roleName: "observation.concept",
			position: 0,
			target: { targetSchema: "Observation", targetPath: "concept" },
			extraction: {
				kind: "concept",
				required: true,
				patterns: [`(?<concept>.+)`],
			},
			required: true,
		},
		{
			argumentId: "trajectory",
			name: "trajectory",
			roleName: "observation.trajectory",
			position: 1,
			target: { targetSchema: "Observation", targetPath: "trajectory" },
			extraction: {
				kind: "enum",
				required: true,
				patterns: [`(?<value>.+)`],
			},
			required: true,
		},
		{
			argumentId: "duration",
			name: "duration",
			roleName: "observation.duration",
			position: 2,
			target: { targetSchema: "Observation", targetPath: "duration" },
			extraction: {
				kind: "measurement",
				patterns: [
					`["']?(?<magnitude>\\d+(?:\\.\\d+)?)\\s+(?<unit>[\\w/°%]+)["']?`,
				],
			},
		},
	],
};

describe("V2 macro compile pipeline", () => {
	it("binds named arguments", () => {
		const input = parseMacroLine(
			"^observation concept=chest pain trajectory=stable",
		)!;
		const result = bindMacro(input, OBSERVATION_MACRO);
		expect(result.issues.filter((i) => i.code === "MISSING_REQUIRED")).toEqual(
			[],
		);
		expect(result.bindings.map((b) => b.name)).toContain("concept");
	});

	it("reports missing required arguments", () => {
		const input = parseMacroLine("^observation trajectory=stable")!;
		const result = bindMacro(input, OBSERVATION_MACRO);
		expect(result.issues.some((i) => i.code === "MISSING_REQUIRED")).toBe(true);
	});

	it("compiles a plan with typed operations and a deterministic fingerprint", async () => {
		const registry = new SchemaRegistry();
		registry.register(observationSchema);

		const dictionary = {
			search: async () => [
				{
					id: "c1",
					namespaceCode: "SNOMED",
					standardCode: "29857009",
					display: "Chest pain",
					active: true,
				},
			],
		};

		const compiler = new MacroCompiler({ registry, dictionary });
		const input = parseMacroLine(
			'^observation concept=SNOMED::29857009 trajectory=stable duration="3 day"',
			0,
			{ definition: OBSERVATION_MACRO },
		)!;
		const result = await compiler.compile(input, OBSERVATION_MACRO, {
			groupId: "grp1",
			scope: { kind: "clinical_document", sessionId: "s1", documentId: "n1" },
		});

		expect(result.plan).toBeDefined();
		expect(result.plan!.operations).toHaveLength(3);
		expect(result.plan!.operations[0]!.value.kind).toBe("concept");
		expect(result.plan!.operations[2]!.value.kind).toBe("measurement");
		expect(result.plan!.fingerprint.algorithm).toBe("v2-plan-fingerprint-v1");

		const preview = renderMacroPreview(result.plan!);
		expect(preview.lines).toHaveLength(3);
		expect(preview.fingerprint).toBe(result.plan!.fingerprint.value);
	});

	it("produces a deterministic fingerprint across repeated compiles", async () => {
		const registry = new SchemaRegistry();
		registry.register(observationSchema);
		const compiler = new MacroCompiler({ registry });
		const input = parseMacroLine(
			"^observation concept=chest pain trajectory=stable",
			0,
			{ definition: OBSERVATION_MACRO },
		)!;
		const a = await compiler.compile(input, OBSERVATION_MACRO, {
			groupId: "g",
		});
		const b = await compiler.compile(input, OBSERVATION_MACRO, {
			groupId: "g",
		});
		expect(a.plan!.fingerprint.value).toBe(b.plan!.fingerprint.value);
	});
});
