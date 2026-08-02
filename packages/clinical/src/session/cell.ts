import type { SoapSection } from "../schemas/shared";

export type CellMode = "cdsl" | "narrative" | "js_script";

export type CellKind = "notebook" | "workspace" | (string & {});

export interface CellCollectionRef {
	kind: CellKind;
	collectionId: string;
}

export type CellIntentKind =
	| "prose"
	| "workspace_command"
	| "variable_command"
	| "cell_configuration"
	| "directed_value"
	| (string & {});

export type CellRoutingScope = "global" | "branch_local" | "unresolved";

export interface CellRoutingTarget {
	scope: CellRoutingScope;
	targetSchema: string | null;
	branchId?: string;
	resolvedSection?: SoapSection | null;
	resolvedSchema?: string | null;
}

export type CellStatus =
	| "draft"
	| "parsing"
	| "pending_commit"
	| "committed"
	| "error"
	| "deleted"
	| "locked";

export type MergeStrategy =
	| "replace"
	| "append"
	| "deep_merge"
	| "partial_fill";

export interface CellLinkTarget {
	targetSchema: string;
	targetCellId: string;
	targetField: string;
	mergeStrategy: MergeStrategy;
}

export interface CellContext {
	objects: Record<string, Record<string, Record<string, unknown>>>;
	sourceType?: "dictation" | "manual_entry" | "imported" | "narrative";
	ambient?: Record<string, unknown>;
}

export enum CellError {
	CELL_IS_LOCKED = "CELL_IS_LOCKED",
	CELL_IS_DELETED = "CELL_IS_DELETED",
	CELL_IS_ALREADY_LOCKED = "CELL_IS_ALREADY_LOCKED",
	CANNOT_LOCK_DELETED_CELL = "CANNOT_LOCK_DELETED_CELL",
	UNRESOLVED_ROUTING = "UNRESOLVED_ROUTING",
	BRANCH_LOCAL_REQUIRES_WORKSPACE_ID = "BRANCH_LOCAL_REQUIRES_WORKSPACE_ID",
	WORKSPACE_STORE_NOT_CONFIGURED = "WORKSPACE_STORE_NOT_CONFIGURED",
	PARSER_NOT_CONFIGURED = "PARSER_NOT_CONFIGURED",
	JS_SCRIPT_NOT_IMPLEMENTED = "JS_SCRIPT_NOT_IMPLEMENTED",
	PARENT_CELL_NOT_FOUND = "PARENT_CELL_NOT_FOUND",
	LINK_TARGET_NOT_FOUND = "LINK_TARGET_NOT_FOUND",
	NARRATIVE_TARGET_REQUIRED = "NARRATIVE_TARGET_REQUIRED",
}

export const CELL_ERROR_MESSAGES: Record<CellError, string> = {
	[CellError.CELL_IS_LOCKED]: "cell is locked",
	[CellError.CELL_IS_DELETED]: "cell is deleted",
	[CellError.CELL_IS_ALREADY_LOCKED]: "cell is already locked",
	[CellError.CANNOT_LOCK_DELETED_CELL]: "cannot lock a deleted cell",
	[CellError.UNRESOLVED_ROUTING]:
		"unresolved routing scope — caller must resolve before processing",
	[CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID]:
		"branch_local cells require workspaceId and branchId",
	[CellError.WORKSPACE_STORE_NOT_CONFIGURED]: "WorkspaceStore not configured",
	[CellError.PARSER_NOT_CONFIGURED]: "CdslParser not configured",
	[CellError.JS_SCRIPT_NOT_IMPLEMENTED]: "js_script mode not implemented",
	[CellError.PARENT_CELL_NOT_FOUND]: "parent cell not found",
	[CellError.LINK_TARGET_NOT_FOUND]: "link target not found",
	[CellError.NARRATIVE_TARGET_REQUIRED]:
		"narrative cells require narrativeTarget",
};

export interface Cell {
	cellId: string;
	sessionId: string;
	collection: CellCollectionRef;
	intentKind: CellIntentKind;
	mode: CellMode;
	rawInput: string;
	routing: CellRoutingTarget;
	parsedOutput: import("../parser/schema-parsers").ParsedItem[] | null;
	workspaceCommands?: import("../engine/workspace-store").WorkspaceCommand[];
	workspaceCommandWarnings?: import("../engine/workspace-store").WorkspaceCommandWarning[];
	status: CellStatus;
	errorMessage?: string;
	lockedAt?: string;
	updatedAt: string;
	metadata?: Record<string, unknown>;
	parentCellId?: string;
	linkTarget?: CellLinkTarget;
	narrativeTarget?: string; // dot-separated SoapNote field path, e.g. "subjective.historyOfPresentIllness.narrative"
	context: CellContext;
	interpretation?: {
		confidence?: {
			score: number;
			level: "high" | "medium" | "low";
			breakdown?: import("../store/learning/interfaces").ParseConfidenceScoreBreakdown;
		};
	};
}
