import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { NotebookStore } from "@stateful-mcp/clinical/store/notebook/notebook-store";
import type { NotebookCellRef } from "@stateful-mcp/clinical/store/notebook/interfaces";

interface SessionState {
	cells: Map<string, Cell>;
	ordering: string[];
}

/**
 * In-memory notebook store for the TUI prototype.
 * Cells are kept in an ordered list keyed by cellId.
 */
export class MemoryNotebookStore implements NotebookStore {
	private sessions = new Map<string, SessionState>();

	async getSessionIds(): Promise<string[]> {
		return Array.from(this.sessions.keys());
	}

	private ensureSession(sessionId: string): SessionState {
		let s = this.sessions.get(sessionId);
		if (!s) {
			s = { cells: new Map(), ordering: [] };
			this.sessions.set(sessionId, s);
		}
		return s;
	}

	async listSession(sessionId: string): Promise<NotebookCellRef[]> {
		const s = this.ensureSession(sessionId);
		return s.ordering
			.filter((id) => s.cells.has(id))
			.map((cellId, position) => {
				const cell = s.cells.get(cellId)!;
				return {
					sessionId,
					cellId,
					position,
					updatedAt: cell.updatedAt,
				};
			});
	}

	async getCell(
		sessionId: string,
		cellId: string,
	): Promise<Cell | null> {
		const s = this.ensureSession(sessionId);
		return s.cells.get(cellId) ?? null;
	}

	async insertCell(
		sessionId: string,
		cell: Cell,
		position: number,
	): Promise<void> {
		const s = this.ensureSession(sessionId);
		s.cells.set(cell.cellId, { ...cell, sessionId });
		if (position < 0 || position >= s.ordering.length) {
			s.ordering.push(cell.cellId);
		} else {
			s.ordering.splice(position, 0, cell.cellId);
		}
	}

	async deleteCell(
		sessionId: string,
		cellId: string,
	): Promise<void> {
		const s = this.ensureSession(sessionId);
		s.cells.delete(cellId);
		s.ordering = s.ordering.filter((id) => id !== cellId);
	}

	async moveCell(
		sessionId: string,
		cellId: string,
		newPosition: number,
	): Promise<void> {
		const s = this.ensureSession(sessionId);
		const idx = s.ordering.indexOf(cellId);
		if (idx === -1) return;
		s.ordering.splice(idx, 1);
		const clamped = Math.max(0, Math.min(newPosition, s.ordering.length));
		s.ordering.splice(clamped, 0, cellId);
	}

	async saveCell(cell: Cell): Promise<void> {
		const s = this.ensureSession(cell.sessionId);
		s.cells.set(cell.cellId, { ...cell });
	}
}