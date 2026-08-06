import { describe, expect, test } from "bun:test";
import {
	nextWorkspaceTab,
	WORKSPACE_TABS,
} from "../src/components/WorkspaceTabs";

describe("workspace tabs", () => {
	test("cycles through the clinical workspace tabs", () => {
		expect(nextWorkspaceTab("notebook")).toBe("assessment");
		expect(nextWorkspaceTab("assessment")).toBe("soap");
		expect(nextWorkspaceTab("concepts")).toBe("notebook");
	});

	test("exposes the future assessment and document workspaces", () => {
		expect(WORKSPACE_TABS.map((tab) => tab.id)).toEqual([
			"notebook",
			"assessment",
			"soap",
			"document",
			"concepts",
		]);
	});
});
