import { describe, expect, test } from "bun:test";
import type { WorkspaceCommand } from "../src/engine/workspace-store";
import type { ClinicalBranch } from "../src/schemas/epistemic";

describe("Workspace cell contract", () => {
	test("ClinicalBranch accepts optional rank, confidence, and acuityLevel", () => {
		const branch: ClinicalBranch = {
			id: "branch_1",
			parentId: null,
			name: "PE",
			hypothesisConcept: {
				conceptId: "SNOMED::59282003",
				display: "Pulmonary Embolism",
			},
			status: "active",
			supportingConcepts: [],
			refutingConcepts: [],
			rank: 1,
			confidence: "confirmed",
			acuityLevel: "acute",
			createdAt: {
				assertedTimestampUtc: new Date().toISOString(),
				precisionLevel: "second",
			},
		};
		expect(branch.rank).toBe(1);
		expect(branch.confidence).toBe("confirmed");
		expect(branch.acuityLevel).toBe("acute");
	});

	test("ClinicalBranch works without optional assessment metadata", () => {
		const branch: ClinicalBranch = {
			id: "branch_2",
			parentId: null,
			name: "Hypothesis",
			hypothesisConcept: {
				conceptId: "hypothesis_default",
				display: "Hypothesis",
			},
			status: "active",
			supportingConcepts: [],
			refutingConcepts: [],
			createdAt: {
				assertedTimestampUtc: new Date().toISOString(),
				precisionLevel: "second",
			},
		};
		expect(branch.rank).toBeUndefined();
		expect(branch.confidence).toBeUndefined();
		expect(branch.acuityLevel).toBeUndefined();
	});

	test("WorkspaceCommand verb types are preserved", () => {
		const cmd: WorkspaceCommand = {
			verb: "branch",
			branchName: "PE",
			conceptRef: "pulmonary embolism",
		};
		expect(cmd.verb).toBe("branch");
		expect(cmd.branchName).toBe("PE");
		expect(cmd.conceptRef).toBe("pulmonary embolism");
	});

	test("WorkspaceCommand close has no extra fields", () => {
		const cmd: WorkspaceCommand = { verb: "close" };
		expect(cmd.verb).toBe("close");
	});

	test("WorkspaceCommand rule_out requires branchRef", () => {
		const cmd: WorkspaceCommand = { verb: "rule_out", branchRef: "branch_1" };
		expect(cmd.verb).toBe("rule_out");
		expect(cmd.branchRef).toBe("branch_1");
	});
});
