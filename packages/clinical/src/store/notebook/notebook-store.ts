import type { Cell } from "../../session/cell";
import type { NotebookCellRef } from "./interfaces";

export interface NotebookStore {
	getSessionIds(): Promise<string[]>;
	listSession(sessionId: string): Promise<NotebookCellRef[]>;
	getCell(sessionId: string, cellId: string): Promise<Cell | null>;
	insertCell(sessionId: string, cell: Cell, position: number): Promise<void>;
	deleteCell(sessionId: string, cellId: string): Promise<void>;
	moveCell(sessionId: string, cellId: string, newPosition: number): Promise<void>;
	saveCell(cell: Cell): Promise<void>;
}