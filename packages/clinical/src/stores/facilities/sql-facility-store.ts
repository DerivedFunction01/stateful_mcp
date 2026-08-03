import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import { ReferenceQueryCompiler } from "../sql/reference-query-compiler";
import type { Facility, FacilityStore } from "./interfaces";

export class SqlFacilityStore implements FacilityStore {
	private readonly compiler: ReferenceQueryCompiler;
	private readonly executor: SqlExecutor;
	private readonly table: string;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		table = "facilities",
	) {
		this.compiler = new ReferenceQueryCompiler(dialect);
		this.executor = executor;
		this.table = table;
	}

	async get(facilityId: string): Promise<Facility | null> {
		const { sql, params } = this.compiler.compileGetFacility(
			facilityId,
			this.table,
		);
		const row = await this.executor.queryOne(sql, params);
		return row ? this.rowToFacility(row) : null;
	}

	async list(): Promise<Facility[]> {
		const { sql, params } = this.compiler.compileListFacilities(this.table);
		const rows = await this.executor.query(sql, params);
		return rows.map((r) => this.rowToFacility(r));
	}

	async set(facility: Facility): Promise<void> {
		const { sql, params } = this.compiler.compileUpsertFacility(
			this.facilityToRow(facility),
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	async delete(facilityId: string): Promise<void> {
		const { sql, params } = this.compiler.compileDeleteFacility(
			facilityId,
			this.table,
		);
		await this.executor.exec(sql, params);
	}

	private facilityToRow(facility: Facility): Record<string, unknown> {
		return {
			facilityId: facility.facilityId,
			facilityCode: facility.facilityCode,
			facilityName: facility.facilityName,
			jurisdictionCode: facility.jurisdictionCode,
		};
	}

	private rowToFacility(row: Record<string, any>): Facility {
		return {
			facilityId: row.facilityId as string,
			facilityCode: row.facilityCode as string,
			facilityName: row.facilityName as string,
			jurisdictionCode: row.jurisdictionCode as string,
		};
	}
}
