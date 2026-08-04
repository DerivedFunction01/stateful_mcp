import { describe, expect, it } from "bun:test";
import { bootstrapCommandDefaults } from "../src/bootstrap/bootstrap-config";
import { CellCompiler } from "../src/cells/cell-compiler";
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
});
