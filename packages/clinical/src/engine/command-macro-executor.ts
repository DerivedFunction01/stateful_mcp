import type { CommandMacroCellPlan, CommandMacroTargetOperation } from "../parser/command-macro-ir";

export interface CommandMacroExecutionAdapter {
	validate?(operation: CommandMacroTargetOperation): Promise<void> | void;
	apply(operation: CommandMacroTargetOperation): Promise<void>;
	rollback?(operation: CommandMacroTargetOperation): Promise<void>;
}

export interface CommandMacroExecutionResult {
	status: "committed" | "error";
	appliedOperationIds: string[];
	diagnostics: string[];
}

/** Executes a compiled direct-operation plan with validate-before-mutate semantics. */
export async function executeCommandMacroPlans(
	plans: CommandMacroCellPlan[],
	adapter: CommandMacroExecutionAdapter,
): Promise<CommandMacroExecutionResult> {
	const operations = plans.flatMap((plan) => plan.operations);
	const diagnostics: string[] = [];
	for (const operation of operations) {
		try { await adapter.validate?.(operation); }
		catch (error) { diagnostics.push(`${operation.operationId}: ${String(error)}`); }
	}
	if (diagnostics.length) return { status: "error", appliedOperationIds: [], diagnostics };
	const applied: CommandMacroTargetOperation[] = [];
	try {
		for (const operation of operations) {
			await adapter.apply(operation);
			applied.push(operation);
		}
		return { status: "committed", appliedOperationIds: applied.map((operation) => operation.operationId), diagnostics: [] };
	} catch (error) {
		diagnostics.push(String(error));
		const appliedOperationIds = applied.map((operation) => operation.operationId);
		if (adapter.rollback) {
			for (const operation of applied.reverse()) {
				try { await adapter.rollback(operation); }
				catch (rollbackError) { diagnostics.push(`rollback ${operation.operationId}: ${String(rollbackError)}`); }
			}
		}
		return { status: "error", appliedOperationIds, diagnostics };
	}
}
