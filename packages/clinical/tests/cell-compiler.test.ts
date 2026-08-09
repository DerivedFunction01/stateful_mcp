import { describe, expect, it } from "bun:test";
import { bootstrapCommandDefaults } from "../src/bootstrap/bootstrap-config";
import { CellCompiler } from "../src/cells/cell-compiler";
import { NOTE_MACRO } from "../src/macros/default-macros";
import { createSyntaxProfile } from "../src/macros/macro-profile";
import { createDefaultSchemaRegistry } from "../src/schemas/default-registry";

const defaultProfile = createSyntaxProfile(
	{ profileId: "v2-default" },
	bootstrapCommandDefaults,
);

describe(" cell compiler", () => {
	it("returns a typed diagnostic for an undefined macro", async () => {
		const compiler = new CellCompiler(
			{ get: async () => null, list: async () => [] },
			createDefaultSchemaRegistry(),
			undefined,
			defaultProfile,
		);
		const result = await compiler.compile("^unknown value=1", {
			sessionId: "s1",
		});
		expect(result.plan).toBeUndefined();
		expect(result.diagnostics).toEqual([" macro 'unknown' is not defined"]);
		expect(result.fingerprint).toBeTruthy();
	});

	it("keeps direct commands on the command-bar path", async () => {
		const compiler = new CellCompiler(
			{ get: async () => null, list: async () => [] },
			createDefaultSchemaRegistry(),
			undefined,
			defaultProfile,
		);
		const result = await compiler.compile(":confirm branch-1");
		expect(result.plan).toBeUndefined();
		expect(result.diagnostics[0]).toMatch(/CommandBarService/);
	});

	it("reparses a macro with its definition before compiling the cell", async () => {
		const compiler = new CellCompiler(
			{
				get: async (name: string) => (name === "note" ? NOTE_MACRO : null),
				list: async () => [NOTE_MACRO],
			},
			createDefaultSchemaRegistry(),
			{
				search: async (query: string) =>
					query.toLowerCase() === "harry potter"
						? [
								{
									id: "c-harry-potter",
									namespaceCode: "BOOK",
									standardCode: "HP",
									display: "Harry Potter",
									active: true,
								},
							]
						: [],
				searchExpressionCandidates: async () => [
					{
						id: "expr-hp",
						term: "Harry Potter",
						lookupTerm: "hp",
						regexPattern: "\\\\bhp\\\\b",
						isCaseInsensitive: true,
						conceptId: "c-harry-potter",
						priorityWeight: 1,
						active: true,
					},
				],
			},
			defaultProfile,
		);

		const result = await compiler.compile("^note hp 10 2004", {
			sessionId: "s1",
		});

		expect(result.diagnostics).toEqual([]);
		expect(result.plan?.operations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ targetPath: "title", rawValue: "hp" }),
				expect.objectContaining({ targetPath: "pageNum", rawValue: "10" }),
				expect.objectContaining({ targetPath: "year", rawValue: "2004" }),
			]),
		);
	});

	it("compiles zero-argument macros with prefilled defaultValue strings through pattern extraction", async () => {
		const ZERO_ARG_VITALS_MACRO = {
			macroId: "v2-zero-vitals-1",
			macroName: "normal_vitals",
			version: 1,
			status: "published" as const,
			active: true,
			root: {
				roleName: "vitals",
				targetSchema: "Observation",
				outputCellKind: "structured" as const,
			},
			arguments: [
				{
					argumentId: "heart_rate",
					name: "heart_rate",
					roleName: "vitals.heart_rate",
					target: { targetSchema: "Observation", targetPath: "rawTerm" },
					defaultValue: "72",
					extraction: {
						kind: "scalar" as const,
						patterns: ["(?<value>\\d{1,3})"],
					},
				},
				{
					argumentId: "blood_pressure",
					name: "blood_pressure",
					roleName: "vitals.blood_pressure",
					target: { targetSchema: "Observation", targetPath: "rawTerm" },
					defaultValue: "120/80",
					extraction: {
						kind: "scalar" as const,
						patterns: ["(?<value>\\d{1,3}\\/\\d{1,3})"],
					},
				},
			],
		};

		const compiler = new CellCompiler(
			{
				get: async (name: string) =>
					name === "normal_vitals" ? ZERO_ARG_VITALS_MACRO : null,
				list: async () => [ZERO_ARG_VITALS_MACRO],
			},
			createDefaultSchemaRegistry(),
			undefined,
			defaultProfile,
		);

		const result = await compiler.compile("^normal_vitals");
		expect(result.plan).toBeDefined();
		expect(result.diagnostics).toEqual([]);
		expect(result.plan?.operations.length).toBe(2);
		expect(result.plan?.operations[0]?.rawValue).toBe("72");
		expect(result.plan?.operations[1]?.rawValue).toBe("120/80");
	});
});
