import type { Cell } from "../../session/cell";

export interface NotebookCellRef {
	sessionId: string;
	cellId: string;
	position: number;
	updatedAt: string;
}

/**
 * Serializable session-document model — the durable editor document (L2).
 * Persists cell order, full cell content, active cursor index, and the
 * in-progress draft on the active cell.
 */
export interface NotebookSessionDocument {
	sessionId: string;
	updatedAt: string;
	ordering: string[];
	cells: Record<string, Cell>;
	activeIndex: number;
	draftText: string;
}
