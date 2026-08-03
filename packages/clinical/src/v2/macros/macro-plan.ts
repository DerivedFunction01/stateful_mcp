/**
 * V2 macro execution plan contracts.
 *
 * The immutable plan produced by the macro compiler from a bound macro input,
 * combined with workspace/document scope. This is the V2 public contract; the
 * legacy `CommandMacroGraphPlan` is reference material only.
 */

import type { MacroDefinitionRef } from "./macro-definition";
import type { TypedValue } from "../values/typed-value";

export type MergeStrategy = "replace" | "append" | "deep_merge" | "partial_fill";

export interface MacroEvidence {
	source: string;
	pattern?: string;
	confidence?: number;
}

export type ExecutionScopeKind = "clinical_document" | "workspace" | "composite";

export interface ExecutionScope {
	kind: ExecutionScopeKind;
	sessionId: string;
	documentId?: string;
	workspaceId?: string;
	branchId?: string;
}

export interface MacroTargetOperation {
	operationId: string;
	groupId: string;
	cellRef?: string;
	targetSchema: string;
	targetPath: string;
	value: TypedValue;
	rawValue: string;
	sourceLine: number;
	sourceArgument?: number;
	evidence: MacroEvidence[];
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
	expectedVersions: ExpectedAggregateVersion[];
	fingerprint: MacroPlanFingerprint;
	diagnostics: string[];
}
