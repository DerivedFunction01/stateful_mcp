import type { Cell, CellCollectionRef } from "../../session/cell";
import type { CellCollectionDocument } from "../cell/cell-document";
import type { NotebookCellRef, NotebookSessionDocument } from "./interfaces";

export interface NotebookStore {
	getSessionIds(): Promise<string[]>;
	loadDocument(sessionId: string): Promise<NotebookSessionDocument | null>;
	saveDocument(doc: NotebookSessionDocument): Promise<void>;
	loadCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<CellCollectionDocument | null>;
	saveCollection(
		sessionId: string,
		collection: CellCollectionDocument,
	): Promise<void>;
	listCollections(sessionId: string): Promise<CellCollectionDocument[]>;
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
