import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { CellIntent } from "@stateful-mcp/clinical/cells/cell-intent";
import type { AutocompleteSuggestion } from "./autocomplete";
import type { CommandDescriptor } from "./command-descriptor";

export interface EditorContext {
	hostKind: string;
	collection: StructuredCell["collection"];
	sessionId: string;
	activeBranchId?: string;
}

export interface CommandCatalog {
	getDescriptors(context: EditorContext): CommandDescriptor[];
	getSuggestions(
		partial: string,
		context: EditorContext,
	): AutocompleteSuggestion[];
}

export interface SubmissionPort {
	plan(text: string, context: EditorContext): CellSubmissionPlan;
	submit(plan: CellSubmissionPlan, context: EditorContext): Promise<void>;
}

export interface CellSubmissionSegment {
	rawText: string;
	start: number;
	end: number;
	cellId?: string;
	intent?: CellIntent;
}

export interface CellSubmissionPlan {
	submissionId: string;
	collection: StructuredCell["collection"];
	segments: CellSubmissionSegment[];
}
