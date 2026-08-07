import { describe, expect, test } from "bun:test";
import {
	ASSESSMENT_TABS,
	nextAssessmentSubTab,
	nextWorkspaceTab,
	previousWorkspaceTab,
	WORKSPACE_TABS,
} from "../src/components/WorkspaceTabs";

describe("workspace tabs", () => {
	test("cycles through the clinical workspace tabs", () => {
		expect(nextWorkspaceTab("notebook")).toBe("subjective");
		expect(nextWorkspaceTab("assessment")).toBe("plan");
		expect(nextWorkspaceTab("concepts")).toBe("notebook");
	});

	test("exposes the SOAP section workspaces and renderer", () => {
		expect(WORKSPACE_TABS.map((tab) => tab.id)).toEqual([
			"notebook",
			"subjective",
			"objective",
			"assessment",
			"plan",
			"soap",
			"document",
			"concepts",
		]);
	});

	test("provides scratchpad and editor Assessment sub-tabs", () => {
		expect(ASSESSMENT_TABS.map((tab) => tab.id)).toEqual([
			"default",
			"scratchpad",
			"editor",
		]);
		expect(nextAssessmentSubTab("default")).toBe("scratchpad");
		expect(nextAssessmentSubTab("scratchpad")).toBe("editor");
		expect(nextAssessmentSubTab("editor", -1)).toBe("scratchpad");
		expect(nextWorkspaceTab("assessment")).toBe("plan");
		expect(previousWorkspaceTab("assessment")).toBe("objective");
	});
});
