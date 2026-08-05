import type { VariableStatement } from "@stateful-mcp/core";
import type { ClinicalOperation } from "../clinical/clinical-operation";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import type {
	WorkspaceAggregate,
	WorkspaceOperation,
} from "../workspaces/workspace-types";

export type CommandBarIntentKind =
	| "editor_command"
	| "workspace_operation"
	| "clinical_operation"
	| "variable_operation"
	| "cell_operation"
	| "navigation"
	| "unsupported";

export type CommandDiagnosticCode =
	| "empty_command"
	| "unknown_command"
	| "missing_argument"
	| "invalid_argument"
	| "missing_context"
	| "ambiguous_reference"
	| "unsupported_command";

export interface CommandDiagnostic {
	code: CommandDiagnosticCode;
	message: string;
	span?: { start: number; end: number };
	severity: "error" | "warning";
}

export interface CommandBarInput {
	rawText: string;
	sessionId: string;
	workspaceId?: string;
	documentId?: string;
	cellId?: string;
	actorId?: string;
}

export interface CommandExecutionInput extends CommandBarInput {
	expectedFingerprint?: string;
}

export interface CommandBarIntent {
	kind: CommandBarIntentKind;
	rawText: string;
	sessionId: string;
	workspaceId?: string;
	documentId?: string;
	cellId?: string;
	operation?: WorkspaceOperation | ClinicalOperation;
	variableStatement?: VariableStatement;
	diagnostics: CommandDiagnostic[];
}

export interface CommandBarWorkspaceContext {
	getWorkspace(workspaceId: string): Promise<WorkspaceAggregate | null>;
	resolveBranchRef(workspace: WorkspaceAggregate, ref: string): { id: string };
}

export interface CommandPreview {
	intent: CommandBarIntent;
	fingerprint: string;
	diagnostics: readonly CommandDiagnostic[];
	plan?: MacroExecutionPlan;
}

export interface CommandAutocompleteContext {
	input: string;
	cursorOffset: number;
	sessionId: string;
	workspaceId?: string;
	documentId?: string;
	activeCellId?: string;
	branches?: ReadonlyArray<{ id: string; commandAlias?: string; name: string }>;
	personnelId?: string;
	macroId?: string;
	macroVersion?: number;
	filledSlots?: readonly string[];
	previousSlot?: string;
	observationMode?: "live" | "preview" | "execution";
}

export interface CommandSuggestion {
	label: string;
	insertText: string;
	kind: "command" | "branch" | "macro" | "argument" | "field" | "value";
	detail?: string;
	score?: number;
	source: "static" | "context";
	argIndex?: number;
	argName?: string;
	descriptionKey?: string;
	macroId?: string;
	macroVersion?: number;
	argumentId?: string;
	parsedValue?: unknown;
	macroEvidence?: {
		score?: number;
		observationCount?: number;
		scope?: "personal" | "global";
		observationMode?: "live" | "preview" | "execution";
		reason?: "transition" | "numericFit" | "parseConfidence" | "static";
		featureKeys?: readonly string[];
	};
	sourceKind?: "macro" | "dictionary" | "custom-expression" | "template";
	expressionId?: string;
	conceptId?: string;
	lookupTerm?: string;
}
