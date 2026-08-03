import { describe, expect, it } from "bun:test";
import { CellCompiler } from "../src/cells-cell-compiler";
import { createDefaultSchemaRegistry } from "../src/schemas/default-registry";

describe(" cell compiler", () => {
	it("returns a typed diagnostic for an undefined macro", async () => {
		const compiler = new CellCompiler(
			{ get: async () => null, list: async () => [] },
			createDefaultSchemaRegistry(),
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
		);
		const result = await compiler.compile(":confirm branch-1");
		expect(result.plan).toBeUndefined();
		expect(result.diagnostics[0]).toMatch(/CommandBarService/);
	});
});
