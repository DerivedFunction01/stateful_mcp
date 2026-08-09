/**
 *  macro execution plan contracts.
 *
 * The immutable plan produced by the macro compiler from a bound macro input,
 * combined with workspace/document scope. This is the  public contract; the
 * legacy `CommandMacroGraphPlan` is reference material only.
 */

import type { ClinicalOperation } from "../clinical/clinical-operation";
import type { ClinicalWritePolicy, MergeStrategy } from "../values/merge";
import type { TypedValue } from "../values/typed-value";
import type { WorkspaceOperation } from "../workspaces/workspace-types";
import type { MacroDefinition, MacroDefinitionRef } from "./macro-definition";

export interface MacroEvidence {
	source: string;
	pattern?: string;
	confidence?: number;
}

export type ExecutionScopeKind =
	| "clinical_document"
	| "workspace"
	| "composite";

export interface ExecutionScope {
	kind: ExecutionScopeKind;
	sessionId: string;
	documentId?: string;
	workspaceId?: string;
	branchId?: string;
}

export interface DocumentPlacementRef {
	placementId: string;
	documentSchema: string;
	documentPath: string;
	targetSchema: string;
	targetSchemaVersion: number;
	cardinality: "one" | "many";
	recordMode?: "create" | "update" | "upsert";
}

export interface MacroTargetOperation {
	operationId: string;
	groupId: string;
	macroDefinitionId?: string;
	cellRef?: string;
	targetSchema: string;
	targetPath: string;
	placement?: DocumentPlacementRef;
	value: TypedValue;
	rawValue: string;
	sourceLine: number;
	sourceArgument?: number;
	writePolicy?: ClinicalWritePolicy;
	evidence: MacroEvidence[];
	failureStage?:
		| "validation"
		| "binding"
		| "extraction"
		| "constraint"
		| "compilation"
		| "projection"
		| "execution";
}

export function expandMacroOperationsByPlacement(
	operations: readonly MacroTargetOperation[],
	placements: readonly DocumentPlacementRef[],
	policy?: MacroDefinition["placementPolicy"],
): MacroTargetOperation[] {
	if (policy) {
		const unauthorized = placements.find(
			(placement) => !policy.allowedPlacementIds.includes(placement.placementId),
		);
		if (unauthorized)
			throw new Error(
				`Placement '${unauthorized.placementId}' is not allowed by the macro placement policy`,
			);
		if (placements.length > 1 && !policy.allowFanOut)
			throw new Error("Macro placement policy does not allow fan-out");
	}
	return operations.flatMap((operation) =>
		placements.map((placement, index) => ({
			...operation,
			operationId: `${operation.operationId}:${placement.placementId}`,
			placement,
			groupId: `${operation.groupId}:${placement.placementId}`,
			sourceArgument: operation.sourceArgument ?? index,
		})),
	);
}

export interface MacroLinkOperation {
	linkId: string;
	parentRef: string;
	childRef: string;
	parentRoleName: string;
	parentTargetPath: string;
	mergeStrategy: MergeStrategy;
	sourceLine: number;
}

export interface GeneratedCellPlan {
	cellRef: string;
	sourceMacroCellId: string;
	macroDefinitionId: string;
	macroDefinitionVersion: number;
	targetSchema: string;
	targetPath?: string;
	parentRef?: string;
	linkTarget?: {
		targetField: string;
		mergeStrategy: MergeStrategy;
	};
	operations: MacroTargetOperation[];
}

export interface ExpectedAggregateVersion {
	aggregateKind: "document" | "workspace" | "branch" | "cell";
	aggregateId: string;
	expectedVersion: number;
	expectedHead?: string;
}

/** Deterministic signature of the plan, used for stale-preview detection. */
export interface MacroPlanFingerprint {
	value: string;
	algorithm: "v2-plan-fingerprint-v1";
}

export interface MacroExecutionPlan {
	groupId: string;
	scope: ExecutionScope;
	macroDefinitions: MacroDefinitionRef[];
	operations: MacroTargetOperation[];
	links: MacroLinkOperation[];
	generatedCells: GeneratedCellPlan[];
	workspaceOperations?: WorkspaceOperation[];
	clinicalOperations?: ClinicalOperation[];
	/** Compensating operations captured against the pre-commit document state. */
	reversal?: {
		clinicalOperations: ClinicalOperation[];
		expectedVersion?: number;
		expectedHead?: string;
	};
	/** Macro-bar execution-mode merge policy; per-operation overrides win. */
	writePolicy?: ClinicalWritePolicy;
	expectedVersions: ExpectedAggregateVersion[];
	fingerprint: MacroPlanFingerprint;
	diagnostics: string[];
}
