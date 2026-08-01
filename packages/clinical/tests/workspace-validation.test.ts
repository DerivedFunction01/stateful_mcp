import { describe, expect, test } from "bun:test";
import {
	DEFAULT_BRANCH_TRANSITION_POLICY,
	DEFAULT_COMPLETION_POLICY,
	validateWorkspace,
} from "../src/session/workspace-validation";

describe("validateWorkspace", () => {
	test("valid workspace with one active branch and no metadata produces no errors", () => {
		const result = validateWorkspace([{ id: "b1", status: "active" }]);
		expect(result.valid).toBe(true);
		expect(result.warnings.filter((w) => w.severity === "error")).toHaveLength(
			0,
		);
	});

	test("multiple active branches produce a warning under default policy", () => {
		const result = validateWorkspace([
			{ id: "b1", status: "active" },
			{ id: "b2", status: "active" },
		]);
		const multiActive = result.warnings.filter(
			(w) => w.code === "MULTIPLE_ACTIVE_BRANCHES",
		);
		expect(multiActive).toHaveLength(1);
		expect(multiActive[0]!.severity).toBe("warning");
	});

	test("missing rank produces a warning when requireRank is true", () => {
		const result = validateWorkspace([{ id: "b1", status: "active" }], {
			...DEFAULT_COMPLETION_POLICY,
			requireRank: true,
		});
		const missingRank = result.warnings.filter(
			(w) => w.code === "MISSING_RANK",
		);
		expect(missingRank).toHaveLength(1);
	});

	test("missing confidence produces a warning when requireConfidence is true", () => {
		const result = validateWorkspace([{ id: "b1", status: "active" }], {
			...DEFAULT_COMPLETION_POLICY,
			requireConfidence: true,
		});
		const missingConf = result.warnings.filter(
			(w) => w.code === "MISSING_CONFIDENCE",
		);
		expect(missingConf).toHaveLength(1);
	});

	test("no warnings when rank and confidence are present with a confirmed branch", () => {
		const result = validateWorkspace([
			{
				id: "b1",
				status: "confirmed",
				rank: 1,
				confidence: "confirmed",
			},
		]);
		expect(result.valid).toBe(true);
		expect(result.warnings).toHaveLength(0);
	});

	test("duplicate ranks produce a warning", () => {
		const result = validateWorkspace([
			{ id: "b1", status: "active", rank: 1 },
			{ id: "b2", status: "active", rank: 1 },
		]);
		const dupRank = result.warnings.filter((w) => w.code === "DUPLICATE_RANK");
		expect(dupRank).toHaveLength(1);
	});

	test("no winner branch produces a warning when requireWinner is true", () => {
		const result = validateWorkspace([{ id: "b1", status: "active" }]);
		const noWinner = result.warnings.filter(
			(w) => w.code === "COMPLETION_WITHOUT_WINNER",
		);
		expect(noWinner).toHaveLength(1);
	});

	test("confirmed branch suppresses completion-without-winner warning", () => {
		const result = validateWorkspace([
			{ id: "b1", status: "confirmed", rank: 1, confidence: "confirmed" },
		]);
		const noWinner = result.warnings.filter(
			(w) => w.code === "COMPLETION_WITHOUT_WINNER",
		);
		expect(noWinner).toHaveLength(0);
	});

	test("transition policy flags unknown branch states as errors", () => {
		const customPolicy = {
			...DEFAULT_BRANCH_TRANSITION_POLICY,
			allowed: {
				...DEFAULT_BRANCH_TRANSITION_POLICY.allowed,
				abandoned: ["active"],
			},
		};
		const result = validateWorkspace(
			[{ id: "b1", status: "abandoned" }],
			DEFAULT_COMPLETION_POLICY,
			customPolicy,
		);
		const invalid = result.warnings.filter(
			(w) => w.code === "INVALID_BRANCH_STATE",
		);
		expect(invalid).toHaveLength(0);
	});

	test("custom policy can require both rank and confidence", () => {
		const strictPolicy = {
			...DEFAULT_COMPLETION_POLICY,
			requireRank: true,
			requireConfidence: true,
		};
		const result = validateWorkspace(
			[{ id: "b1", status: "active" }],
			strictPolicy,
		);
		expect(result.warnings.some((w) => w.code === "MISSING_RANK")).toBe(true);
		expect(result.warnings.some((w) => w.code === "MISSING_CONFIDENCE")).toBe(
			true,
		);
	});

	test("permissive policy with no requirements produces no warnings for minimal branch", () => {
		const permissive = {
			requireRank: false,
			requireConfidence: false,
			allowMultipleActiveBranches: true,
			requireWinner: false,
		};
		const result = validateWorkspace(
			[{ id: "b1", status: "active" }],
			permissive,
		);
		expect(result.warnings).toHaveLength(0);
		expect(result.valid).toBe(true);
	});

	test("ruled_out branch does not trigger completion-without-winner", () => {
		const result = validateWorkspace([
			{ id: "b1", status: "ruled_out", rank: 2, confidence: "refuted" },
		]);
		const noWinner = result.warnings.filter(
			(w) => w.code === "COMPLETION_WITHOUT_WINNER",
		);
		expect(noWinner).toHaveLength(0);
	});

	test("validation result valid is false when there are error-severity warnings", () => {
		const customPolicy = {
			...DEFAULT_BRANCH_TRANSITION_POLICY,
			allowed: {
				active: ["suspended"],
				suspended: ["active"],
				ruled_out: [],
				abandoned: [],
			},
		};
		const result = validateWorkspace(
			[{ id: "b1", status: "confirmed" }],
			DEFAULT_COMPLETION_POLICY,
			customPolicy,
		);
		expect(result.valid).toBe(false);
	});
});
