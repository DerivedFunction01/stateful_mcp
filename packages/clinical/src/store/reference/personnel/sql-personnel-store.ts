import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ReferenceQueryCompiler } from "../../sql/reference-query-compiler";
import type { Personnel, PersonnelStore } from "./interfaces";

export class SqlPersonnelStore implements PersonnelStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(dialect: SqlDialect, executor: SqlExecutor, table = "personnel") {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
	}

	async get(personnelId: string): Promise<Personnel | null> {
		const { sql, params } = this.compiler.compileGetPersonnel(
			personnelId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToPersonnel(row) : null;
	}

	async list(): Promise<Personnel[]> {
		const { sql, params } = this.compiler.compileListPersonnel(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToPersonnel(r));
	}

	async set(personnel: Personnel): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertPersonnel(
			this.personnelToRow(personnel),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(personnelId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeletePersonnel(
			personnelId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private personnelToRow(personnel: Personnel): Record<string, unknown> {
		return {
			personnelId: personnel.personnelId,
			fullName: personnel.fullName,
			specialtyCode: personnel.specialtyCode,
			facilityId: personnel.facilityId,
		};
	}

	private rowToPersonnel(row: Record<string, any>): Personnel {
		return {
			personnelId: row.personnelId as string,
			fullName: row.fullName as string,
			specialtyCode: row.specialtyCode as string,
			facilityId: row.facilityId as string,
		};
	}
}
