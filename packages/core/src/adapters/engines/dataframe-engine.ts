import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { registerAdapter } from "../../config/loader";
import type {
	FilterCondition,
	QueryDefinition,
} from "../../middleware/filter/types";
import type { QueryEngine } from "./interfaces";

export class DataFrameQueryEngine implements QueryEngine {
	public supportedOpFamilies = ["comparison", "set", "sort", "aggregation"];
	public supportedOperations = [
		"eq",
		"neq",
		"gt",
		"geq",
		"lt",
		"leq",
		"like",
		"not_like",
		"in_set",
		"not_in_set",
		"between",
		"not_between",
	];

	private instance!: DuckDBInstance;
	private connection!: DuckDBConnection;
	private initPromise: Promise<void>;
	private journalFile: string;
	private hasJournal = false;

	constructor(
		private sourceFile: string,
		private dataframeName: string,
	) {
		this.journalFile = `${this.sourceFile}.journal.jsonl`;
		this.initPromise = this.initialize();
	}

	private async initialize(): Promise<void> {
		this.instance = await DuckDBInstance.create(":memory:");
		this.connection = await this.instance.connect();
	}

	public async loadDataFrame(): Promise<void> {
		await this.initPromise;
		this.hasJournal = existsSync(this.journalFile);
		await this.recreateView();
	}

	private async recreateView(): Promise<void> {
		if (this.hasJournal) {
			await this.connection.run(`
        CREATE OR REPLACE VIEW "${this.dataframeName}" AS 
        SELECT * FROM '${this.sourceFile}'
        UNION ALL
        SELECT * FROM read_json_auto('${this.journalFile}')
      `);
		} else {
			await this.connection.run(
				`CREATE OR REPLACE VIEW "${this.dataframeName}" AS SELECT * FROM '${this.sourceFile}'`,
			);
		}
	}

	/**
	 * Append a new row to the state journal log.
	 */
	public async appendRow(row: Record<string, any>): Promise<void> {
		await this.initPromise;

		const firstWrite = !this.hasJournal;

		// Append JSON line first, so the file has content when DuckDB reads it
		await fs.appendFile(this.journalFile, JSON.stringify(row) + "\n", "utf-8");

		if (firstWrite) {
			this.hasJournal = true;
			await this.recreateView();
		}
	}

	/**
	 * Compact the write log journal back into the baseline data file.
	 */
	public async compact(): Promise<void> {
		await this.initPromise;
		if (!this.hasJournal) return;

		const ext = path.extname(this.sourceFile).toLowerCase();
		const tempFile = `${this.sourceFile}.compacted.tmp`;

		let formatOption = "";
		if (ext === ".parquet") {
			formatOption = "(FORMAT 'PARQUET')";
		} else if (ext === ".csv") {
			formatOption = "(FORMAT 'CSV', HEADER true)";
		} else if (ext === ".json" || ext === ".jsonl") {
			formatOption = "(FORMAT 'JSON')";
		} else {
			throw new Error(`Unsupported compaction output format: ${ext}`);
		}

		// Export current consolidated view to the temporary file
		await this.connection.run(
			`COPY "${this.dataframeName}" TO '${tempFile}' ${formatOption}`,
		);

		// Overwrite baseline file and clean up journal
		await fs.rename(tempFile, this.sourceFile);
		await fs.rm(this.journalFile, { force: true });
		this.hasJournal = false;

		// Point the view back directly to the compacted baseline file
		await this.recreateView();
	}

	private compileCondition(cond: FilterCondition, params: any[]): string {
		const prop = `"${cond.property}"`;
		const val = cond.value;

		switch (cond.operator) {
			case "eq":
				params.push(val);
				return `${prop} = ?`;
			case "neq":
				params.push(val);
				return `${prop} != ?`;
			case "gt":
				params.push(val);
				return `${prop} > ?`;
			case "geq":
				params.push(val);
				return `${prop} >= ?`;
			case "lt":
				params.push(val);
				return `${prop} < ?`;
			case "leq":
				params.push(val);
				return `${prop} <= ?`;
			case "like": {
				const list = Array.isArray(val) ? val : [val];
				if (list.length === 0) return "1=0";
				const conds = list.map((item) => {
					params.push(item);
					return `${prop} LIKE ?`;
				});
				return `(${conds.join(" OR ")})`;
			}
			case "not_like": {
				const list = Array.isArray(val) ? val : [val];
				if (list.length === 0) return "1=1";
				const conds = list.map((item) => {
					params.push(item);
					return `${prop} NOT LIKE ?`;
				});
				return `(${conds.join(" AND ")})`;
			}
			case "in_set": {
				const list = Array.isArray(val)
					? val
					: String(val)
							.split(",")
							.map((s) => s.trim());
				list.forEach((v) => params.push(v));
				const placeholders = list.map(() => "?").join(", ");
				return `${prop} IN (${placeholders})`;
			}
			case "not_in_set": {
				const list = Array.isArray(val)
					? val
					: String(val)
							.split(",")
							.map((s) => s.trim());
				list.forEach((v) => params.push(v));
				const placeholders = list.map(() => "?").join(", ");
				return `${prop} NOT IN (${placeholders})`;
			}
			case "between":
				if (Array.isArray(val) && val.length === 2) {
					params.push(val[0], val[1]);
					return `${prop} BETWEEN ? AND ?`;
				}
				throw new Error("Operator 'between' requires a 2-element array.");
			case "not_between":
				if (Array.isArray(val) && val.length === 2) {
					params.push(val[0], val[1]);
					return `${prop} NOT BETWEEN ? AND ?`;
				}
				throw new Error("Operator 'not_between' requires a 2-element array.");
			default:
				throw new Error(`Unsupported SQL operator: ${cond.operator}`);
		}
	}

	public compile(
		tableName: string,
		query: QueryDefinition,
		params: any[] = [],
	): { sql: string; params: unknown[] } {
		let selectClause = "*";
		if (query.aggregations && query.aggregations.length > 0) {
			const parts = query.aggregations.map((agg) => {
				if (agg.function === "count") return "COUNT(*)";
				return `${agg.function.toUpperCase()}("${agg.property}")`;
			});
			selectClause = parts.join(", ");
		}

		let sql = `SELECT ${selectClause} FROM "${tableName}"`;

		const whereParts: string[] = [];
		if (query.filters && query.filters.length > 0) {
			query.filters.forEach((c: FilterCondition) => {
				whereParts.push(this.compileCondition(c, params));
			});
		}

		if (whereParts.length > 0) {
			sql += ` WHERE ${whereParts.join(" AND ")}`;
		}

		if (query.sort && query.sort.length > 0) {
			const sortParts = query.sort.map(
				(s) => `"${s.property}" ${s.direction.toUpperCase()}`,
			);
			sql += ` ORDER BY ${sortParts.join(", ")}`;
		}

		if (query.limit !== undefined) {
			sql += ` LIMIT ${query.limit}`;
		}
		if (query.offset !== undefined) {
			sql += ` OFFSET ${query.offset}`;
		}

		return { sql, params };
	}

	async execute(tableName: string, query: QueryDefinition): Promise<unknown[]> {
		await this.initPromise;
		const params: any[] = [];
		const { sql, params: compiledParams } = this.compile(
			tableName,
			query,
			params,
		);

		let reader;
		if (compiledParams.length > 0) {
			const stmt = await this.connection.prepare(sql);
			await stmt.bind(compiledParams as any);
			reader = await stmt.run();
		} else {
			reader = await this.connection.run(sql);
		}

		const colNames = reader.columnNames();
		const rows = await reader.getRows();

		// Map rows array back into objects matching column keys, converting BigInts
		const records = rows.map((row) => {
			const record: Record<string, any> = {};
			colNames.forEach((name, i) => {
				const val = row[i];
				record[name] = typeof val === "bigint" ? Number(val) : val;
			});
			return record;
		});

		return records;
	}

	public destroy() {
		try {
			this.connection?.closeSync();
			this.instance?.closeSync();
		} catch (_) {}
	}
}

// Register dataframe engine adapter
registerAdapter("dataframe", {
	create: async (options) => {
		const sourceFile = path.resolve(process.cwd(), String(options.source_file));
		const dataframeName = String(options.dataframe_name || "df");
		const engine = new DataFrameQueryEngine(sourceFile, dataframeName);
		await engine.loadDataFrame();
		return engine;
	},
});
