import type { Cell } from "../../session/cell";
import type { NotebookCellRef, NotebookSessionDocument } from "./interfaces";

export interface NotebookStore {
	getSessionIds(): Promise<string[]>;
	loadDocument(sessionId: string): Promise<NotebookSessionDocument | null>;
	saveDocument(doc: NotebookSessionDocument): Promise<void>;
	listSession(sessionId: string): Promise<NotebookCellRef[]>;
	getCell(sessionId: string, cellId: string): Promise<Cell | null>;
	insertCell(sessionId: string, cell: Cell, position: number): Promise<void>;
	deleteCell(sessionId: string, cellId: string): Promise<void>;
	moveCell(
		sessionId: string,
		cellId: string,
		newPosition: number,
	): Promise<void>;
}
