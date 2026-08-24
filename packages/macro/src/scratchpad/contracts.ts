export interface ScratchpadCell {
	lineNumber: number;
	rawText: string;
	/**
	 * Hidden default macro for this logical cell. Explicit macro syntax in
	 * `rawText` always wins over this default. The default is retained across
	 * content edits and is never persisted as visible text.
	 */
	defaultMacroId?: string;
	executed?: boolean;
	status?: "empty" | "valid" | "invalid" | "nonMacro" | "executed";
	executionReceipt?: Record<string, unknown>;
	slots?: Record<string, unknown>;
}

export interface ScratchpadResource {
	scratchpadId: string;
	formatVersion: number;
	title: string;
	createdAt: string;
	updatedAt: string;
	textRevision: number;
	rawText: string;
	lines: ScratchpadCell[];
	executedLineIndices: number[];
	metadata: Record<string, unknown>;
}

export interface ScratchpadResourceStore {
	create(
		scratchpadId: string,
		title?: string,
		initialText?: string,
		metadata?: Record<string, unknown>,
	): Promise<ScratchpadResource>;
	open(scratchpadId: string): Promise<ScratchpadResource | null>;
	save(resource: ScratchpadResource): Promise<void>;
	list(): Promise<
		Array<
			Pick<
				ScratchpadResource,
				| "scratchpadId"
				| "formatVersion"
				| "title"
				| "createdAt"
				| "updatedAt"
				| "textRevision"
				| "metadata"
			>
		>
	>;
	delete(scratchpadId: string): Promise<void>;
}

export class ScratchpadConflictError extends Error {
	readonly code = "SCRATCHPAD_CONFLICT";

	constructor(
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "ScratchpadConflictError";
	}
}
