import { describe, expect, it } from "bun:test";
import { WorkspaceCommandParser } from "../src/session/workspace-command-parser";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";

describe("WorkspaceCommandParser", () => {
	it("extracts configured commands and preserves ordinary segments", () => {
		const result = new WorkspaceCommandParser().parseCell(
			"#workspace rule_out PE || #vital temp 38.9 C",
			SEED_PARSER_PROFILES[0]!,
		);
		expect(result.commands).toEqual([{ verb: "rule_out", branchRef: "PE" }]);
		expect(result.remainingText).toBe("#vital temp 38.9 C");
		expect(result.warnings).toEqual([]);
	});

	it("uses profile aliases instead of hardcoded command words", () => {
		const profile = {
			...SEED_PARSER_PROFILES[0]!,
			tagMappings: { workspace_local: "WorkspaceCommand" },
			workspaceCommandMappings: { descartar: "rule_out" as const },
		};
		const result = new WorkspaceCommandParser().parseCell(
			"#workspace_local descartar PE || ordinary text",
			profile,
		);
		expect(result.commands).toEqual([{ verb: "rule_out", branchRef: "PE" }]);
		expect(result.remainingText).toBe("ordinary text");
	});

	it("reports malformed commands without throwing", () => {
		const result = new WorkspaceCommandParser().parseCell(
			"#workspace close extra || #workspace unknown PE",
			SEED_PARSER_PROFILES[0]!,
		);
		expect(result.commands).toEqual([]);
		expect(result.warnings).toEqual(["MALFORMED", "UNKNOWN_ALIAS"]);
	});
});
