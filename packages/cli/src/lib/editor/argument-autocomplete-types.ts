import type { CommandArgumentDescriptor } from "./command-descriptor";

export interface ArgumentAutocompleteContext {
	commandId: string;
	commandVerb: string;
	argumentIndex: number;
	argumentPrefix: string;
	priorArguments: string[];
	allArguments: string[];
	sessionId: string;
	workspaceId?: string;
	documentId?: string;
	activeCellId?: string;
	blockInstanceId?: string;
	argumentDescriptor?: CommandArgumentDescriptor;
}

export interface ArgumentCompletionCandidate {
	value: string;
	label?: string;
	detailKey?: string;
	source:
		| "static"
		| "history"
		| "scope"
		| "dictionary"
		| "transition"
		| "profile";
	valid: boolean;
	baseScore?: number;
}

export interface ArgumentCompletionProvider {
	supports(context: ArgumentAutocompleteContext): boolean;
	getSuggestions(
		context: ArgumentAutocompleteContext,
	): Promise<ArgumentCompletionCandidate[]>;
}

export interface VariableScopeReader {
	getScope(
		sessionId: string,
		blockInstanceId?: string,
	): Promise<Record<string, unknown>>;
}
