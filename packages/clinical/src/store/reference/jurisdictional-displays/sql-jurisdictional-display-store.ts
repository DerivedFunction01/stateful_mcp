import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ReferenceQueryCompiler } from "../../sql/reference-query-compiler";
import type {
	JurisdictionalDisplay,
	JurisdictionalDisplayStore,
} from "./interfaces";

export class SqlJurisdictionalDisplayStore
	implements JurisdictionalDisplayStore
{
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "jurisdictional_displays",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
		this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		for (const ddl of this.compiler.getJurisdictionalDisplaysTableDDL(
			this.table,
		)) {
			await this.executor.exec(ddl.sql);
		}
	}

	async get(
		conceptId: string,
		jurisdictionId: string,
		source?: string,
	): Promise<JurisdictionalDisplay | null> {
		const s = source ?? "local";
		const { sql, params } = this.compiler.compileGetJurisdictionalDisplay(
			conceptId,
			jurisdictionId,
			s,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToDisplay(row) : null;
	}

	async list(): Promise<JurisdictionalDisplay[]> {
		const { sql, params } = this.compiler.compileListJurisdictionalDisplays(
			this.table,
		);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToDisplay(r));
	}

	async set(display: JurisdictionalDisplay): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertJurisdictionalDisplay(
			this.displayToRow(display),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(
		conceptId: string,
		jurisdictionId: string,
		source: string,
	): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteJurisdictionalDisplay(
			conceptId,
			jurisdictionId,
			source,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private displayToRow(
		display: JurisdictionalDisplay,
	): Record<string, unknown> {
		return {
			conceptId: display.conceptId,
			jurisdictionId: display.jurisdictionId,
			preferredDisplay: display.preferredDisplay,
			fullySpecifiedName: display.fullySpecifiedName,
			source: display.source || "local",
		};
	}

	private rowToDisplay(row: Record<string, any>): JurisdictionalDisplay {
		return {
			conceptId: row.conceptId as string,
			jurisdictionId: row.jurisdictionId as string,
			preferredDisplay: row.preferredDisplay as string,
			fullySpecifiedName: row.fullySpecifiedName as string,
			source: row.source as string,
		};
	}
}
