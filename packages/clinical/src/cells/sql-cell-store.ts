import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { createCell, editCell, supersedeCell } from "./cell-factory";
import { CellQueryCompiler } from "./cell-query-compiler";
import type { CellStore, CreateCellRequest } from "./cell-service-types";
import { isStructuredCellRecord } from "./structured-cell-validation";
import type { StructuredCell } from "./structured-cell";

export class SqlCellStore implements CellStore {
	private readonly compiler: CellQueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly table = "v2_cells",
	) {
		this.compiler = new CellQueryCompiler(dialect);
		this.ready = this.ensureTable();
	}

	async get(cellId: string): Promise<StructuredCell | null> {
		await this.ready;
		const query = this.compiler.getByIdQuery(cellId, this.table);
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? this.fromRow(row) : null;
	}

	async list(sessionId: string): Promise<StructuredCell[]> {
		await this.ready;
		const query = this.compiler.listBySessionQuery(sessionId, this.table);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => this.fromRow(row)).filter((cell): cell is StructuredCell => Boolean(cell));
	}

	async listByCollection(
		sessionId: string,
		collection: StructuredCell["collection"],
	): Promise<StructuredCell[]> {
		await this.ready;
		const query = this.compiler.listByCollectionQuery(
			sessionId,
			collection.kind,
			collection.collectionId,
			this.table,
		);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => this.fromRow(row)).filter((cell): cell is StructuredCell => Boolean(cell));
	}

	async save(cell: StructuredCell): Promise<void> {
		await this.ready;
		const query = this.compiler.upsertQuery(this.toRow(cell), this.table);
		await this.executor.exec(query.sql, query.params);
	}

	async delete(cellId: string): Promise<void> {
		await this.ready;
		const query = this.compiler.deleteQuery(cellId, this.table);
		await this.executor.exec(query.sql, query.params);
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

	private async ensureTable(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(query.sql, query.params);
		}
	}

	private toRow(cell: StructuredCell): {
		cellId: string;
		sessionId: string;
		collectionKind: string;
		collectionId: string;
		cellJson: string;
	} {
		return {
			cellId: cell.cellId,
			sessionId: cell.sessionId,
			collectionKind: cell.collection.kind,
			collectionId: cell.collection.collectionId,
			cellJson: JSON.stringify(cell),
		};
	}

	private fromRow(row: Record<string, unknown>): StructuredCell | null {
		let parsed: unknown;
		try {
			parsed =
				typeof row.cellJson === "string"
					? JSON.parse(row.cellJson)
					: row.cellJson;
		} catch {
			return null;
		}
		if (!isStructuredCellRecord(parsed)) return null;
		return parsed as StructuredCell;
	}
}
