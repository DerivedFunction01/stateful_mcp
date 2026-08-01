import type { BranchLifecycleState } from "../schemas/epistemic";
import type { Certainty } from "../schemas/shared";

export type WorkspaceValidationCode =
	| "MULTIPLE_ACTIVE_BRANCHES"
	| "MISSING_RANK"
	| "MISSING_CONFIDENCE"
	| "INVALID_TRANSITION"
	| "UNSUPPORTED_ASSESSMENT_FIELD"
	| "UNRESOLVED_ROUTING"
	| "INVALID_BRANCH_STATE"
	| "DUPLICATE_RANK"
	| "COMPLETION_WITHOUT_WINNER";

export interface WorkspaceValidationWarning {
	code: WorkspaceValidationCode;
	severity: "warning" | "error";
	branchId?: string;
	cellId?: string;
	messageKey: string;
	details?: Record<string, unknown>;
}

export interface BranchTransitionPolicy {
	allowed: Record<BranchLifecycleState, BranchLifecycleState[]>;
}

export const DEFAULT_BRANCH_TRANSITION_POLICY: BranchTransitionPolicy = {
	allowed: {
		active: ["suspended", "confirmed", "ruled_out", "abandoned"],
		suspended: ["active", "abandoned"],
		confirmed: ["active", "abandoned"],
		ruled_out: ["active", "abandoned"],
		abandoned: [],
	},
};

export interface CompletionPolicy {
	requireRank: boolean;
	requireConfidence: boolean;
	allowMultipleActiveBranches: boolean;
	requireWinner: boolean;
}

export const DEFAULT_COMPLETION_POLICY: CompletionPolicy = {
	requireRank: true,
	requireConfidence: true,
	allowMultipleActiveBranches: false,
	requireWinner: true,
};

export interface ValidationResult {
	warnings: WorkspaceValidationWarning[];
	valid: boolean;
}

function validateBranchTransitions(
	branches: Array<{ id: string; status: BranchLifecycleState }>,
	policy: BranchTransitionPolicy,
): WorkspaceValidationWarning[] {
	const warnings: WorkspaceValidationWarning[] = [];
	for (const branch of branches) {
		const allowed = policy.allowed[branch.status];
		if (allowed === undefined) {
			warnings.push({
				code: "INVALID_BRANCH_STATE",
				severity: "error",
				branchId: branch.id,
				messageKey: "validation.unknownBranchState",
				details: { status: branch.status },
			});
		}
	}
	return warnings;
}

function validateRankAndConfidence(
	branches: Array<{
		id: string;
		rank?: number;
		confidence?: Certainty;
	}>,
	policy: CompletionPolicy,
): WorkspaceValidationWarning[] {
	const warnings: WorkspaceValidationWarning[] = [];
	if (!policy.requireRank && !policy.requireConfidence) return warnings;

	const ranks: number[] = [];
	for (const branch of branches) {
		if (policy.requireRank && branch.rank === undefined) {
			warnings.push({
				code: "MISSING_RANK",
				severity: "warning",
				branchId: branch.id,
				messageKey: "validation.missingRank",
			});
		} else if (policy.requireRank && branch.rank !== undefined) {
			ranks.push(branch.rank);
		}
		if (policy.requireConfidence && branch.confidence === undefined) {
			warnings.push({
				code: "MISSING_CONFIDENCE",
				severity: "warning",
				branchId: branch.id,
				messageKey: "validation.missingConfidence",
			});
		}
	}

	if (policy.requireRank && ranks.length > 0) {
		const seen = new Set<number>();
		for (const r of ranks) {
			if (seen.has(r)) {
				warnings.push({
					code: "DUPLICATE_RANK",
					severity: "warning",
					messageKey: "validation.duplicateRank",
					details: { rank: r },
				});
			}
			seen.add(r);
		}
	}

	return warnings;
}

function validateActiveBranches(
	branches: Array<{ id: string; status: BranchLifecycleState }>,
	policy: CompletionPolicy,
): WorkspaceValidationWarning[] {
	const warnings: WorkspaceValidationWarning[] = [];
	const activeCount = branches.filter((b) => b.status === "active").length;
	if (!policy.allowMultipleActiveBranches && activeCount > 1) {
		warnings.push({
			code: "MULTIPLE_ACTIVE_BRANCHES",
			severity: "warning",
			messageKey: "validation.multipleActiveBranches",
			details: { count: activeCount },
		});
	}
	return warnings;
}

export function validateWorkspace(
	branches: Array<{
		id: string;
		status: BranchLifecycleState;
		rank?: number;
		confidence?: Certainty;
	}>,
	policy: CompletionPolicy = DEFAULT_COMPLETION_POLICY,
	transitionPolicy: BranchTransitionPolicy = DEFAULT_BRANCH_TRANSITION_POLICY,
): ValidationResult {
	const warnings: WorkspaceValidationWarning[] = [];

	warnings.push(...validateBranchTransitions(branches, transitionPolicy));
	warnings.push(...validateRankAndConfidence(branches, policy));
	warnings.push(...validateActiveBranches(branches, policy));

	const hasWinner = branches.some(
		(b) => b.status === "confirmed" || b.status === "ruled_out",
	);
	if (policy.requireWinner && !hasWinner) {
		warnings.push({
			code: "COMPLETION_WITHOUT_WINNER",
			severity: "warning",
			messageKey: "validation.noWinnerBranch",
		});
	}

	return {
		warnings,
		valid: warnings.filter((w) => w.severity === "error").length === 0,
	};
}
