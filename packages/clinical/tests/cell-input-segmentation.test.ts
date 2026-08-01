import { describe, expect, test } from "bun:test";
import { segmentCellInput } from "../src/session/cell-input-segmentation";
import { WorkspaceCommandProvider } from "../src/session/workspace-command-provider";

const profile = {
	cellCommandToken: ":",
	workspaceCommandMappings: {
		branch: "branch",
		confirm: "confirm",
		set: "set",
	},
	fieldMappings: { severity: "ObservationEvent.severity" },
} as any;

describe("shared cell input segmentation", () => {
	test("preserves prose and workspace command order", () => {
		const segments = segmentCellInput(
			"patient has chest pain\n:branch PE pulmonary embolism\nheart rate is elevated",
			profile,
			{
				isWorkspaceCommand: (verb) => ["branch", "confirm"].includes(verb),
			},
		);

		expect(segments.map((segment) => segment.kind)).toEqual([
			"prose",
			"workspace_command",
			"prose",
		]);
		expect(segments[1]?.text).toBe(":branch PE pulmonary embolism");
	});

	test("keeps cell configuration attached to following prose", () => {
		const segments = segmentCellInput(
			":set severity\npatient reports severe pain",
			profile,
			{ isCellConfiguration: (verb) => verb === "set" },
		);

		expect(segments).toHaveLength(1);
		expect(segments[0]?.kind).toBe("cell_configuration");
		expect(segments[0]?.text).toContain("patient reports severe pain");
	});
});

describe("workspace command provider", () => {
	test("exposes profile aliases and branch completions", () => {
		const provider = new WorkspaceCommandProvider({
			...profile,
			workspaceCommandMappings: { ro: "rule_out", confirm: "confirm" },
		} as any);
		const descriptors = provider.getDescriptors();
		const ruleOut = descriptors.find(
			(descriptor) => descriptor.verb === "rule_out",
		);

		expect(ruleOut?.aliases).toContain("ro");
		const values = provider.getArgumentCompletions("confirm", 0, {
			workspaceId: "work_1",
			sourceSoapNoteId: "note_1",
			activeBranchId: "branch_1",
			branches: [
				{
					branchId: "branch_1",
					name: "PE",
					commandAlias: "pe",
					status: "active",
					hypothesisConcept: null,
					supporting: [],
					refuting: [],
					supportingCount: 0,
					refutingCount: 0,
				},
			],
			globalFacts: [],
			cells: [],
			lifecycle: { closeRequested: false },
		} as any);
		expect(values).toEqual(["branch_1", "PE", "pe"]);
	});
});
