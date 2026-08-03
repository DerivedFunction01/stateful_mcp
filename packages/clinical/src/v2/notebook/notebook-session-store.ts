export type V2NotebookEditorMode = "NORMAL" | "INSERT" | "COMMAND" | "MACRO" | "VISUAL";

export interface V2NotebookSessionRecord {
	sessionId: string;
	cellOrder: string[];
	activeCellId?: string;
	workspaceId?: string;
	documentId?: string;
	draftText?: string;
	editorMode?: V2NotebookEditorMode;
	commandHistory: string[];
	revision: number;
	updatedAt: string;
}

export interface V2NotebookSessionStore {
	get(sessionId: string): Promise<V2NotebookSessionRecord | null>;
	list(): Promise<V2NotebookSessionRecord[]>;
	save(record: V2NotebookSessionRecord, expectedRevision?: number): Promise<void>;
	delete(sessionId: string): Promise<void>;
}
