import type { KvBackend } from "@stateful-mcp/core";
import { createCell, editCell, supersedeCell } from "./cell-factory";
import type { CellStore, CreateCellRequest } from "./cell-service-types";
import type { StructuredCell } from "./structured-cell";

export class KvCellStore implements CellStore {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:cell:",
	) {}

	private key(cellId: string): string {
		return `${this.prefix}${cellId}`;
	}

	async get(cellId: string): Promise<StructuredCell | null> {
		const data = await this.backend.load();
		return this.read(data[this.key(cellId)]);
	}

	async list(sessionId: string): Promise<StructuredCell[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((value) => this.read(value))
			.filter((cell): cell is StructuredCell => Boolean(cell))
			.filter((cell) => cell.sessionId === sessionId);
	}

	async listByCollection(
		sessionId: string,
		collection: StructuredCell["collection"],
	): Promise<StructuredCell[]> {
		const cells = await this.list(sessionId);
		return cells.filter(
			(cell) =>
				cell.collection.kind === collection.kind &&
				cell.collection.collectionId === collection.collectionId,
		);
	}

	async save(cell: StructuredCell): Promise<void> {
		await this.backend.set(this.key(cell.cellId), JSON.stringify(cell));
		await this.backend.save();
	}

	async delete(cellId: string): Promise<void> {
		await this.backend.delete(this.key(cellId));
		await this.backend.save();
	}

	async create(request: CreateCellRequest): Promise<StructuredCell> {
		const cell = createCell(request);
		await this.save(cell);
		return cell;
	}

	async edit(
		cellId: string,
		rawText: string,
		expectedRevision: number,
	): Promise<StructuredCell> {
		const existing = await this.get(cellId);
		if (!existing) throw new Error(`Cell '${cellId}' not found`);
		const updated = editCell(existing, rawText, expectedRevision);
		await this.save(updated);
		return updated;
	}

	async supersede(
		cellId: string,
		newRawText: string,
		expectedRevision: number,
		authorId?: string,
	): Promise<StructuredCell> {
		const existing = await this.get(cellId);
		if (!existing) throw new Error(`Cell '${cellId}' not found`);
		const superseded = supersedeCell(
			existing,
			newRawText,
			expectedRevision,
			authorId,
		);
		await this.save(superseded);
		return superseded;
	}

	private read(value: unknown): StructuredCell | null {
		if (typeof value !== "string") return null;
		try {
			return JSON.parse(value) as StructuredCell;
		} catch {
			return null;
		}
	}
}
