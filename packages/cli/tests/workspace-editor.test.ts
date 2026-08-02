import { describe, expect, test } from "bun:test";
import { currentCommandLine, replaceCurrentLine } from "../src/lib/cell-editor";
import { WorkspaceCommandCatalog } from "../src/lib/workspace-editor";

const profile = {
	workspaceCommandMappings: {
		confirm: "confirm",
		ro: "rule_out",
	},
} as any;

const context = {
	hostKind: "workspace",
	collection: { kind: "workspace", collectionId: "work_1" },
	sessionId: "session_1",
};

describe("workspace editor composition", () => {
	test("extracts only the current command line from a multiline draft", () => {
		expect(currentCommandLine("clinical prose\n:con")).toBe(":con");
		expect(currentCommandLine("clinical prose")).toBe("");
		expect(replaceCurrentLine("clinical prose\n:con", ":confirm ")).toBe(
			"clinical prose\n:confirm ",
		);
	});

	test("returns rich workspace and variable suggestions", () => {
		const catalog = new WorkspaceCommandCatalog(profile, null);
		const suggestions = catalog.getSuggestions("con", context);
		const confirm = suggestions.find(
			(suggestion) => suggestion.verb === "confirm",
		);

		expect(confirm?.kind).toBe("verb");
		expect(confirm?.source).toBe("cell");
		expect(confirm?.argNames).toEqual(["branch"]);
		expect(catalog.getSuggestions("var ", context).length).toBeGreaterThan(0);
	});
});
