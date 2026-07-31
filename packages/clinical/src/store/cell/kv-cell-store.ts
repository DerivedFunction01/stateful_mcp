import type { KvBackend } from "@stateful-mcp/core";
import type { Cell } from "../../session/cell";
import type { CellStore } from "../interfaces";

export class KvCellStore implements CellStore {
	constructor(private readonly backend: KvBackend) {}

	async get(cellId: string): Promise<Cell | null> {
		const data = await this.backend.load();
		const raw = data[cellId];
		if (!raw) return null;
		return JSON.parse(raw as string) as Cell;
	}

	async list(sessionId: string): Promise<Cell[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((v) => JSON.parse(v as string) as Cell)
			.filter((c) => c.sessionId === sessionId);
	}

	async save(cell: Cell): Promise<void> {
		await this.backend.set(cell.cellId, JSON.stringify(cell));
		await this.backend.save();
	}

	async delete(cellId: string): Promise<void> {
		await this.backend.delete(cellId);
		await this.backend.save();
	}
}