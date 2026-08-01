import type { KvBackend } from "@stateful-mcp/core";
import type { Cell, CellCollectionRef } from "../../session/cell";
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

	async listByCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<Cell[]> {
		const cells = await this.list(sessionId);
		return cells.filter(
			(cell) =>
				cell.collection.kind === collection.kind &&
				cell.collection.collectionId === collection.collectionId,
		);
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
