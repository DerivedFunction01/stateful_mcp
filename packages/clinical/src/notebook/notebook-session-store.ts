import type { SoapSection } from "../rendering/template-types";
import type { NotebookEditorMode } from "./notebook-state";

export type NotebookUiTab = "scratchpad" | "editor";

export interface ScratchpadCell {
	cellId: string;
	text: string;
	pinnedMacroIds: readonly string[];
	explicitPins: boolean;
}

export interface SoapSectionUiState {
	activeTab: NotebookUiTab;
	activeCellId?: string;
	cells: ScratchpadCell[];
}

export interface SoapWorkspaceUiState {
	sections: Partial<Record<SoapSection, SoapSectionUiState>>;
}

export interface NotebookUiState {
	soap?: SoapWorkspaceUiState;
	sidebar?: {
		activeTab?: string;
		open?: boolean;
	};
	workspace?: Record<string, unknown>;
}

export interface NotebookSessionRecord {
	sessionId: string;
	cellOrder: string[];
	activeCellId?: string;
	workspaceId?: string;
	documentId?: string;
	draftText?: string;
	editorMode?: NotebookEditorMode;
	commandHistory: string[];
	uiState?: NotebookUiState;
	revision: number;
	updatedAt: string;
}

export interface NotebookSessionStore {
	get(sessionId: string): Promise<NotebookSessionRecord | null>;
	list(): Promise<NotebookSessionRecord[]>;
	save(record: NotebookSessionRecord, expectedRevision?: number): Promise<void>;
	delete(sessionId: string): Promise<void>;
}
