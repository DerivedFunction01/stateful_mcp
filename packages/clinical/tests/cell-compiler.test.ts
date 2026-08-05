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
						targetAssignment: "note.title",
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
});
