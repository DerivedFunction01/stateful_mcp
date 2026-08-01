import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { Cell, CellCollectionRef } from "../../session/cell";
import type { CellStore } from "../interfaces";
import { CellQueryCompiler } from "../sql/cell-query-compiler";

export class SqlCellStore implements CellStore {
	private readonly compiler: CellQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(dialect: SqlDialect, executor: SqlExecutor, table = "cells") {
		this.compiler = new CellQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getTableDDL(this.table);
		for (const stmt of ddl) {
			await this.executor.exec(stmt.sql, stmt.params);
		}
	}

	async get(cellId: string): Promise<Cell | null> {
		const { sql, params } = this.compiler.compileGetQuery(cellId, this.table);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToRecord(row) : null;
	}

	async list(sessionId: string): Promise<Cell[]> {
		const { sql, params } = this.compiler.compileListBySessionQuery(
			sessionId,
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r: Record<string, any>) => this.rowToRecord(r));
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
		const { sql, params } = this.compiler.compileUpsertQuery(
			this.recordToRow(cell),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(cellId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteQuery(
			cellId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private recordToRow(cell: Cell): Record<string, unknown> {
		return {
			cellId: cell.cellId,
			sessionId: cell.sessionId,
			cellJson: JSON.stringify(cell),
		};
	}

	private rowToRecord(row: Record<string, any>): Cell {
		return JSON.parse(row.cellJson as string) as Cell;
	}
}
