import {
	type CompiledQuery,
	QueryCompiler,
	type SqlDialect,
} from "@stateful-mcp/core";

export class PatientQueryCompiler {
	private readonly compiler: QueryCompiler;

	constructor(private readonly dialect: SqlDialect) {
		this.compiler = new QueryCompiler(dialect);
	}

	getTableDDL(table: string): CompiledQuery[] {
		const columns = [
			{ name: "patientId", type: "text", nullable: false },
			{ name: "mrn", type: "text", nullable: false, unique: true },
			{ name: "displayName", type: "text", nullable: false },
			{ name: "givenNamesText", type: "text", nullable: false },
			{ name: "primaryOrSurname", type: "text", nullable: false },
			{ name: "administrativeGender", type: "text", nullable: false },
			{ name: "lifecycle", type: "text", nullable: false },
			{ name: "organismType", type: "text", nullable: false },
			{ name: "originationDateUtc", type: "timestamp", nullable: false },
			{ name: "profileBlob", type: "json", nullable: false },
		];
		return [
			this.compiler.compileCreateTable({
				table,
				ifNotExists: true,
				primaryKey: ["patientId"],
				columns,
			}),
			this.compiler.compileCreateIndex({
				table,
				name: `idx_${table}_search`,
				columns: ["displayName", "mrn", "administrativeGender", "lifecycle"],
			}),
		];
	}

	compileGet(patientId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "patientId", op: "eq", value: patientId }],
			limit: 1,
		});
	}

	compileGetByMrn(mrn: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "mrn", op: "eq", value: mrn }],
			limit: 1,
		});
	}

	compileList(table: string): CompiledQuery {
		return this.compiler.compileSelect({ table });
	}

	compileUpsert(row: Record<string, unknown>, table: string): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns: this.dialect === "sqlite" ? undefined : ["patientId"],
		});
	}

	compileDelete(patientId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "patientId", op: "eq", value: patientId }],
		});
	}
}
