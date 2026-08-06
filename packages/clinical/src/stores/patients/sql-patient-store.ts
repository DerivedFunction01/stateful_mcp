import type { SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import { SqlQueryEngine } from "@stateful-mcp/core/adapters/engines/sql-query";
import type { QueryDefinition } from "@stateful-mcp/core/middleware/filter/types";
import type { PatientProfile } from "../../schemas/schemas-interface/patient";
import { PatientQueryCompiler } from "../sql/patient-query-compiler";
import {
	type PatientSearchResult,
	type PatientStore,
	patientFromRow,
	patientProjection,
} from "./interfaces";

export class SqlPatientStore implements PatientStore {
	private readonly engine: SqlQueryEngine;
	private readonly compiler: PatientQueryCompiler;
	private readonly ready: Promise<void>;

	constructor(
		backend: SqlBackend,
		private readonly executor: SqlExecutor,
		private readonly table = "clinical_patients",
	) {
		this.engine = new SqlQueryEngine(backend);
		this.compiler = new PatientQueryCompiler(backend.dialect);
		this.ready = this.ensureTable();
	}

	private async ensureTable() {
		for (const query of this.compiler.getTableDDL(this.table))
			await this.executor.exec(query.sql, query.params);
	}

	async get(patientId: string) {
		await this.ready;
		const query = this.compiler.compileGet(patientId, this.table);
		const row = (await this.executor.query(query.sql, query.params))[0];
		return row ? patientFromRow(row) : null;
	}

	async getByMrn(mrn: string) {
		await this.ready;
		const query = this.compiler.compileGetByMrn(mrn, this.table);
		const row = (await this.executor.query(query.sql, query.params))[0];
		return row ? patientFromRow(row) : null;
	}

	async search(query: QueryDefinition): Promise<PatientSearchResult[]> {
		await this.ready;
		const rows = await this.engine.execute(this.table, query);
		return rows.map((row) => {
			const value = row as Record<string, unknown>;
			return {
				patientId: String(value.patientId),
				mrn: String(value.mrn),
				displayName: String(value.displayName),
				administrativeGender:
					value.administrativeGender as PatientProfile["administrativeGender"],
				lifecycle: value.lifecycle as PatientProfile["lifecycle"],
				organismType: String(value.organismType),
			};
		});
	}

	async list() {
		await this.ready;
		const query = this.compiler.compileList(this.table);
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => patientFromRow(row));
	}

	async set(patient: PatientProfile) {
		await this.ready;
		const row = patientProjection(patient);
		const query = this.compiler.compileUpsert(
			{ ...row, profileBlob: JSON.stringify(row.profileBlob) },
			this.table,
		);
		await this.executor.exec(query.sql, query.params);
	}

	async delete(patientId: string) {
		await this.ready;
		const query = this.compiler.compileDelete(patientId, this.table);
		await this.executor.exec(query.sql, query.params);
	}
}
