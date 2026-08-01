import type {
	WorkspaceCommand,
	WorkspaceCommandWarning,
	WorkspaceStore,
} from "../engine/workspace-store";
import type { CdslParser } from "../parser/cdsl-parser";
import type { ParserSyntaxProfile } from "../store/interfaces";
import type { Cell } from "./cell";

export interface CellCommandProcessResult {
	cell: Cell;
	error?: { code: string; message?: string };
}

export type CellCommandVerb =
	| "up"
	| "down"
	| "go"
	| "top"
	| "bottom"
	| "run"
	| "preview"
	| "insert"
	| "delete"
	| "split"
	| "mode"
	| "target"
	| "link"
	| "unlink"
	| "parent"
	| "help"
	| "status"
	| "save"
	| "clear"
	| (string & {});

export interface CellCommand {
	verb: CellCommandVerb;
	args: string[];
	raw: string;
}

export interface CellCommandContext {
	sessionId: string;
	activeCellIndex?: number;
	cells?: Cell[];
	cell: Cell;
	parser?: CdslParser;
	workspaceStore?: WorkspaceStore;
	profile: ParserSyntaxProfile;
	processor?: {
		execute(cell: Cell): Promise<CellCommandProcessResult>;
		preview(cell: Cell): Promise<CellCommandProcessResult>;
		delete(cell: Cell): CellCommandProcessResult;
	};
}

export interface CellCommandResult {
	success: boolean;
	message?: string;
	errorCode?: CellCommandError;
	targetCellIndex?: number;
	cell?: Cell;
	workspaceId?: string;
	workspaceCommands?: WorkspaceCommand[];
	warnings?: WorkspaceCommandWarning[];
	output?: unknown;
	parsedOutput?: Cell["parsedOutput"];
}

export enum CellCommandError {
	UNKNOWN_COMMAND = "UNKNOWN_COMMAND",
	INVALID_ARGUMENT = "INVALID_ARGUMENT",
	CONFIGURATION = "CONFIGURATION",
	UNRESOLVED_TARGET = "UNRESOLVED_TARGET",
	INVALID_MODE = "INVALID_MODE",
	INVALID_MERGE_STRATEGY = "INVALID_MERGE_STRATEGY",
	MALFORMED_COMMAND = "MALFORMED_COMMAND",
	WORKSPACE_CONTEXT = "WORKSPACE_CONTEXT",
}

export const CELL_COMMAND_ERROR_MESSAGES: Record<
	CellCommandError,
	string | ((arg: string) => string)
> = {
	[CellCommandError.UNKNOWN_COMMAND]: (v: string) =>
		`unknown cell command: ${v}`,
	[CellCommandError.INVALID_ARGUMENT]: (v: string) => v,
	[CellCommandError.CONFIGURATION]: "cell processor is not configured",
	[CellCommandError.UNRESOLVED_TARGET]:
		"cannot resolve target schema for :target",
	[CellCommandError.INVALID_MODE]: "mode must be cdsl, narrative, or js_script",
	[CellCommandError.INVALID_MERGE_STRATEGY]: "invalid link merge strategy",
	[CellCommandError.MALFORMED_COMMAND]: "malformed workspace command",
	[CellCommandError.WORKSPACE_CONTEXT]:
		"workspace command requires workspace and branch context",
};

export enum InvalidArgReason {
	GO_INDEX = "GO_INDEX",
	PARENT_ID = "PARENT_ID",
	SET_FIELD_VALUE = "SET_FIELD_VALUE",
	LINK_TARGET = "LINK_TARGET",
}

export const INVALID_ARG_MESSAGES: Record<InvalidArgReason, string> = {
	[InvalidArgReason.GO_INDEX]: "go requires a non-negative cell index",
	[InvalidArgReason.PARENT_ID]: "parent requires a cell id",
	[InvalidArgReason.SET_FIELD_VALUE]: "target requires a field and value",
	[InvalidArgReason.LINK_TARGET]:
		"link requires targetSchema, targetCellId, and targetField",
};
