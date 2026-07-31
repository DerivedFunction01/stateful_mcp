export type CellMode = "cdsl" | "narrative" | "js_script";

export type CellRoutingScope = "global" | "branch_local" | "unresolved";

export interface CellRoutingTarget {
	scope: CellRoutingScope;
	targetSchema: string | null;
	branchId?: string;
}

export interface Cell {
	cellId: string;
	sessionId: string;
	mode: CellMode;
	rawInput: string;
	routing: CellRoutingTarget;
	parsedOutput: import("../parser/schema-parsers").ParsedItem[] | null;
	status: "draft" | "parsing" | "pending_commit" | "committed" | "error";
	errorMessage?: string;
	updatedAt: string;
}
