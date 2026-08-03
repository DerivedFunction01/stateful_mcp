import type { NotebookEditorMode } from "./notebook-state";

export interface NotebookSessionRecord {
	sessionId: string;
	cellOrder: string[];
	activeCellId?: string;
	workspaceId?: string;
	documentId?: string;
	draftText?: string;
	editorMode?: NotebookEditorMode;
	commandHistory: string[];
	revision: number;
	updatedAt: string;
}

export interface NotebookSessionStore {
	get(sessionId: string): Promise<NotebookSessionRecord | null>;
	list(): Promise<NotebookSessionRecord[]>;
	save(
		record: NotebookSessionRecord,
		expectedRevision?: number,
	): Promise<void>;
	delete(sessionId: string): Promise<void>;
}
