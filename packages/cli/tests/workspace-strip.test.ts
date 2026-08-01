import { describe, expect, test } from "bun:test";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { withActiveBranch } from "../src/components/WorkspaceStrip";
import { t } from "../src/lib/i18n";

function makeSnapshot(
	activeBranchId: string | null,
	names: string[] = ["Hypothesis"],
): WorkspaceSnapshot {
	return {
		workspaceId: "work_abcdef123456",
		sourceSoapNoteId: "note_x",
		activeBranchId,
		branches: names.map((name, i) => ({
			branchId: `branch_${i}`,
			name,
			status: i === 0 ? "active" : "suspended",
			hypothesisConcept: { conceptId: `c${i}`, display: name },
			supporting: [],
			refuting: [],
			supportingCount: 3,
			refutingCount: 1,
		})),
		globalFacts: [],
		globalFactCount: 0,
	};
}

describe("withActiveBranch", () => {
	test("returns null for a null snapshot", () => {
		expect(withActiveBranch(null)).toBeNull();
	});

	test("picks the branch matching activeBranchId", () => {
		const snap = makeSnapshot("branch_1", ["A", "B"]);
		const d = withActiveBranch(snap);
		expect(d?.branch.branchId).toBe("branch_1");
		expect(d?.branch.name).toBe("B");
	});

	test("falls back to branches[0] when activeBranchId is null", () => {
		const snap = makeSnapshot(null, ["A", "B"]);
		const d = withActiveBranch(snap);
		expect(d?.branch.branchId).toBe("branch_0");
		expect(d?.branch.name).toBe("A");
	});

	test("returns null when no branches exist", () => {
		const snap = makeSnapshot("branch_0", []);
		expect(withActiveBranch(snap)).toBeNull();
	});
});

describe("workspace.strip i18n", () => {
	test("full and short templates exist and interpolate", () => {
		const full = t("workspace.strip.full", {
			id: "work_abcd",
			name: "Hypothesis",
			status: "active",
			sup: 3,
			ref: 1,
		});
		expect(full).toContain("work_abcd");
		expect(full).toContain("Hypothesis");
		expect(full).toContain("3");
		expect(full).toContain("1");

		const short = t("workspace.strip.short", {
			id: "work_abcd",
			name: "Hypothesis",
			status: "active",
		});
		expect(short).toContain("active");
	});
});
