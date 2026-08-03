import { extractCommandValue } from "./command-value-adapter";

export interface CommandMacroEvidence {
	source: string;
	pattern?: string;
	confidence?: number;
}

export interface CommandMacroTargetOperation {
	operationId: string;
	groupId: string;
	cellRef: string;
	targetSchema: string;
	targetPath: string;
	rawValue: string;
	value: unknown;
	sourceLine: number;
	sourceArgument: number;
	evidence: CommandMacroEvidence[];
}

export interface CommandMacroCellPlan {
	cellRef: string;
	targetSchema: string;
	macroDefinitionId?: string;
	macroDefinitionVersion?: number;
	rootTarget?: string;
	operations: CommandMacroTargetOperation[];
	parentRef?: string;
	linkTarget?: {
		targetField: string;
		mergeStrategy: "replace" | "append" | "deep_merge" | "partial_fill";
	};
	proseRegion?: {
		rawText: string;
		start: number;
		end: number;
		targetSchema: string;
	};
}

export interface CommandMacroLinkOperation {
	linkId: string;
	parentRef: string;
	childRef: string;
	parentRoleName: string;
	parentTargetPath: string;
	mergeStrategy: "replace" | "append" | "deep_merge" | "partial_fill";
	sourceLine: number;
}

export interface CommandMacroGraphPlan {
	groupId: string;
	plans: CommandMacroCellPlan[];
	links: CommandMacroLinkOperation[];
	definitionIds: string[];
	definitionVersions: Record<string, number>;
	diagnostics: string[];
	compatibilitySignature: string;
}

export interface CommandMacroExecutionTrace {
	phase:
		| "lex"
		| "bind"
		| "validate"
		| "render"
		| "apply"
		| "link"
		| "commit"
		| "rollback";
	status: "started" | "completed" | "failed";
	line?: number;
	operationId?: string;
	linkId?: string;
	message?: string;
	createdAt: string;
}

export function buildCommandMacroCompatibilitySignature(
	plans: readonly CommandMacroCellPlan[],
	links: readonly CommandMacroLinkOperation[],
): string {
	const targets = plans
		.flatMap((plan) =>
			plan.operations.map(
				(operation) => `${operation.targetSchema}:${operation.targetPath}`,
			),
		)
		.sort();
	const linkTargets = links
		.map(
			(link) =>
				`${link.parentRoleName}:${link.parentTargetPath}:${link.mergeStrategy}`,
		)
		.sort();
	return [...new Set([...targets, ...linkTargets])].join("|");
}

export interface CommandMacroValueResult {
	value: unknown;
	namedGroups?: Record<string, string | undefined>;
	evidence: CommandMacroEvidence[];
	diagnostics: string[];
	confidence?: number;
}

export const extractCommandMacroValue = extractCommandValue;
