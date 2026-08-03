import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { V2WorkspaceAggregate } from "../workspaces/workspace-types";
import { clinicalOperationsFromWorkspaceCompletion } from "./workspace-clinical-linkage";

/**
 * Composite-transaction autowiring: given a plan that completes a workspace,
 * derive the corresponding PrimaryDiagnosis/DifferentialDiagnosis clinical
 * operations from the workspace's current branch state and attach them to the
 * plan's `clinicalOperations`.
 *
 * This keeps workspace and clinical streams as independent participants of the
 * same transaction: the workspace `complete` event and the derived clinical
 * records commit together, without either stream mutating the other.
 */
export function enrichPlanWithCompletionLinkage(
	plan: MacroExecutionPlan,
	workspace: V2WorkspaceAggregate,
): MacroExecutionPlan {
	const documentId = plan.scope.documentId;
	if (!documentId) return plan;
	const completes = (plan.workspaceOperations ?? []).some(
		(operation) => operation.kind === "complete",
	);
	if (!completes) return plan;
	const derived = clinicalOperationsFromWorkspaceCompletion({
		documentId,
		workspace,
	});
	if (!derived.length) return plan;
	return {
		...plan,
		clinicalOperations: [...(plan.clinicalOperations ?? []), ...derived],
	};
}
