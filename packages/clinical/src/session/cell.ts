export type CellMode = "cdsl" | "narrative" | "js_script";

export type CellRoutingScope = "global" | "branch_local" | "unresolved";

export interface CellRoutingTarget {
	scope: CellRoutingScope;
	targetSchema: string | null;
	branchId?: string;
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
	NARRATIVE_PIPELINE_NOT_IMPLEMENTED = "NARRATIVE_PIPELINE_NOT_IMPLEMENTED",
	JS_SCRIPT_NOT_IMPLEMENTED = "JS_SCRIPT_NOT_IMPLEMENTED",
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
	[CellError.NARRATIVE_PIPELINE_NOT_IMPLEMENTED]:
		"narrative pipeline not yet implemented",
	[CellError.JS_SCRIPT_NOT_IMPLEMENTED]: "js_script mode not implemented",
};

export interface Cell {
	cellId: string;
	sessionId: string;
	mode: CellMode;
	rawInput: string;
	routing: CellRoutingTarget;
	parsedOutput: import("../parser/schema-parsers").ParsedItem[] | null;
	workspaceId?: string;
	status:
		| "draft"
		| "parsing"
		| "pending_commit"
		| "committed"
		| "error"
		| "deleted"
		| "locked";
	errorMessage?: string;
	lockedAt?: string;
	updatedAt: string;
}
