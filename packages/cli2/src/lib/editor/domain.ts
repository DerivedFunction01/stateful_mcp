import type { EditorContext } from "./contracts";

export interface CommandResult {
	success: boolean;
	message?: string;
	action?: string;
	data?: unknown;
}

export type DomainAction =
	| { type: "run"; cellIds?: string[]; indexes?: number[] }
	| { type: "preview" }
	| { type: "showInfo" }
	| { type: "openWorkspace" }
	| { type: "quit" };

export interface DomainPort {
	run(
		context: EditorContext,
		action: { cellIds?: string[]; indexes?: number[] },
	): Promise<void>;
	preview(context: EditorContext): Promise<void>;
	dispatchCommand(line: string, context: EditorContext): Promise<CommandResult>;
}
