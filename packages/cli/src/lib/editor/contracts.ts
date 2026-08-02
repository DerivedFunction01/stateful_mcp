import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type {
	CellCollectionRef,
	CellIntentKind,
} from "@stateful-mcp/clinical/session/cell";
import type { CellInputSegment } from "@stateful-mcp/clinical/session/cell-input-segmentation";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";

export interface EditorContext {
	hostKind: string;
	collection: CellCollectionRef;
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

export interface CellSubmissionSegment extends CellInputSegment {
	cellId?: string;
	intentKind: CellIntentKind;
}

export interface CellSubmissionPlan {
	submissionId: string;
	collection: CellCollectionRef;
	segments: CellSubmissionSegment[];
}
