import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { Cell, CellCollectionRef } from "../../session/cell";
import type { CellCollectionDocument } from "../cell/cell-document";
import { collectionKey } from "../cell/cell-document";
import { NotebookQueryCompiler } from "../sql/notebook-query-compiler";
import type { NotebookCellRef, NotebookSessionDocument } from "./interfaces";
import type { NotebookStore } from "./notebook-store";

/**
 * Sql-backed durable notebook store.
 *
 * Two tables:
 *   - `notebook_sessions(sessionId PK, activeIndex INT, draftText TEXT, updatedAt TEXT)`
 *   - `notebook_cells(sessionId, cellId, position INT, cellJson JSON)`
 *
 * `loadDocument` reads the session row plus position-sorted cell rows.
 * `saveDocument` upserts the session row and does a delete-then-insert
 * cell batch (simplest correct whole-doc save), wrapped in a transaction.
 */
export class SqlNotebookStore implements NotebookStore {
	private readonly compiler: NotebookQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly ready: Promise<void>;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		sessionsTable = "notebook_sessions",
		cellsTable = "notebook_cells",
	) {
		this.compiler = new NotebookQueryCompiler(
			dialect,
			sessionsTable,
			cellsTable,
		);
		this.executor = executor;
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const ddl = this.compiler.getTableDDL();
		for (const stmt of ddl) {
			await this.executor.exec(stmt.sql, stmt.params);
		}
	}

	async getSessionIds(): Promise<string[]> {
		await this.ready;
		const { sql, params } = this.compiler.compileGetSessionIdsQuery();
		const rows = await this.executor.query(sql, params);
		return rows.map((r: Record<string, any>) => r.sessionId as string);
	}

	async loadDocument(
		sessionId: string,
	): Promise<NotebookSessionDocument | null> {
		await this.ready;
		const { sql: sessionSql, params: sessionParams } =
			this.compiler.compileGetSessionQuery(sessionId);
		const sessionRow = await this.executor.queryOne(sessionSql, sessionParams);
		if (!sessionRow) return null;

		const { sql: cellsSql, params: cellsParams } =
			this.compiler.compileGetCellsQuery(sessionId);
		const cellRows = await this.executor.query(cellsSql, cellsParams);

		const ordering: string[] = [];
		const cells: Record<string, Cell> = {};
		for (const row of cellRows) {
			// SqlBackend auto-normalizes JSON-looking strings to objects, so
			// cellJson may already be an object — handle both shapes.
			const raw = row.cellJson;
			const cell: Cell =
				typeof raw === "string" ? (JSON.parse(raw) as Cell) : (raw as Cell);
			cells[cell.cellId] = cell;
			ordering.push(cell.cellId);
		}

		return {
			sessionId,
			updatedAt: sessionRow.updatedAt as string,
			ordering,
			cells,
			activeIndex: Number(sessionRow.activeIndex ?? 0),
			draftText: (sessionRow.draftText as string) ?? "",
			collections: sessionRow.collectionsJson
				? typeof sessionRow.collectionsJson === "string"
					? JSON.parse(sessionRow.collectionsJson as string)
					: (sessionRow.collectionsJson as Record<
							string,
							CellCollectionDocument
						>)
				: {},
		};
	}

	async saveDocument(doc: NotebookSessionDocument): Promise<void> {
		await this.ready;
		const sessionUpsert = this.compiler.compileUpsertSessionQuery({
			sessionId: doc.sessionId,
			activeIndex: doc.activeIndex,
			draftText: doc.draftText,
			updatedAt: doc.updatedAt,
			collectionsJson: JSON.stringify(doc.collections ?? {}),
		});
		const deleteCells = this.compiler.compileDeleteCellsQuery(doc.sessionId);
		const insertCells = doc.ordering
			.filter((id) => doc.cells[id])
			.map((cellId, position) =>
				this.compiler.compileInsertCellQuery({
					sessionId: doc.sessionId,
					cellId,
					position,
					cellJson: JSON.stringify(doc.cells[cellId]!),
				}),
			);

		const statements = [sessionUpsert, deleteCells, ...insertCells];
		await this.executor.transaction(statements);
	}

	async loadCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<CellCollectionDocument | null> {
		const document = await this.loadDocument(sessionId);
		return document?.collections?.[collectionKey(collection)] ?? null;
	}

	async saveCollection(
		sessionId: string,
		collection: CellCollectionDocument,
	): Promise<void> {
		const document =
			(await this.loadDocument(sessionId)) ?? emptyDocument(sessionId);
		document.collections ??= {};
		document.collections[collectionKey(collection.collection)] = collection;
		document.updatedAt = new Date().toISOString();
		await this.saveDocument(document);
	}

	async listCollections(sessionId: string): Promise<CellCollectionDocument[]> {
		const document = await this.loadDocument(sessionId);
		return document?.collections ? Object.values(document.collections) : [];
	}

	async listSession(sessionId: string): Promise<NotebookCellRef[]> {
		const doc = await this.loadDocument(sessionId);
		if (!doc) return [];
		return doc.ordering
			.filter((id) => doc.cells[id])
			.map((cellId, position) => ({
				sessionId,
				cellId,
				position,
				updatedAt: doc.cells[cellId]!.updatedAt,
			}));
	}

	async getCell(sessionId: string, cellId: string): Promise<Cell | null> {
		const doc = await this.loadDocument(sessionId);
		if (!doc) return null;
		return doc.cells[cellId] ?? null;
	}

	async insertCell(
		sessionId: string,
		cell: Cell,
		position: number,
	): Promise<void> {
		await this.ready;
		const doc =
			(await this.loadDocument(sessionId)) ?? emptyDocument(sessionId);
		doc.cells[cell.cellId] = { ...cell, sessionId };
		if (position < 0 || position >= doc.ordering.length) {
			doc.ordering.push(cell.cellId);
		} else {
			doc.ordering.splice(position, 0, cell.cellId);
		}
		doc.updatedAt = new Date().toISOString();
		await this.saveDocument(doc);
	}

	async deleteCell(sessionId: string, cellId: string): Promise<void> {
		await this.ready;
		const doc = await this.loadDocument(sessionId);
		if (!doc) return;
		delete doc.cells[cellId];
		doc.ordering = doc.ordering.filter((id) => id !== cellId);
		doc.updatedAt = new Date().toISOString();
		await this.saveDocument(doc);
	}

	async moveCell(
		sessionId: string,
		cellId: string,
		newPosition: number,
	): Promise<void> {
		await this.ready;
		const doc = await this.loadDocument(sessionId);
		if (!doc) return;
		const idx = doc.ordering.indexOf(cellId);
		if (idx === -1) return;
		doc.ordering.splice(idx, 1);
		const clamped = Math.max(0, Math.min(newPosition, doc.ordering.length));
		doc.ordering.splice(clamped, 0, cellId);
		doc.updatedAt = new Date().toISOString();
		await this.saveDocument(doc);
	}
}

function emptyDocument(sessionId: string): NotebookSessionDocument {
	return {
		sessionId,
		updatedAt: new Date().toISOString(),
		ordering: [],
		cells: {},
		activeIndex: 0,
		draftText: "",
		collections: {},
	};
}
