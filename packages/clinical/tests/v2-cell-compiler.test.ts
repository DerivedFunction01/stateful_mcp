import { describe, expect, it } from "bun:test";
import { V2CellCompiler } from "../src/v2/cells/v2-cell-compiler";
import { createDefaultV2SchemaRegistry } from "../src/v2/schemas/default-registry";

describe("V2 cell compiler", () => {
	it("returns a typed diagnostic for an undefined macro", async () => {
		const compiler = new V2CellCompiler(
			{ get: async () => null, list: async () => [] },
			createDefaultV2SchemaRegistry(),
		);
		const result = await compiler.compile("^unknown value=1", { sessionId: "s1" });
		 expect(result.plan).toBeUndefined();
		 expect(result.diagnostics).toEqual(["V2 macro 'unknown' is not defined"]);
		 expect(result.fingerprint).toBeTruthy();
	});

	it("keeps direct commands on the command-bar path", async () => {
		const compiler = new V2CellCompiler(
			{ get: async () => null, list: async () => [] },
			createDefaultV2SchemaRegistry(),
		);
		const result = await compiler.compile(":confirm branch-1");
		expect(result.plan).toBeUndefined();
		expect(result.diagnostics[0]).toMatch(/CommandBarService/);
	});
});
