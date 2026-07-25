export type SqlDialect = "sqlite" | "postgres" | "duckdb" | "opfs";

export interface CompiledQuery {
	sql: string;
	params: any[];
}

export type FilterOp =
	| "eq"
	| "neq"
	| "gt"
	| "geq"
	| "lt"
	| "leq"
	| "like"
	| "not_like"
	| "ilike"
	| "not_ilike"
	| "starts_with"
	| "ends_with"
	| "str_contains"
	| "in_set"
	| "not_in_set"
	| "between"
	| "not_between"
	| "json_contains"
	| "is_null"
	| "is_not_null";

export type SqlFunctionOp =
	| "year"
	| "month"
	| "day"
	| "quarter"
	| "date_diff"
	| "to_string"
	| "to_number"
	| "round"
	| "ceil"
	| "floor"
	| "starts_with"
	| "ends_with"
	| "str_contains"
	| "substring"
	| "trim"
	| "lower"
	| "upper"
	| "concat";

/**
 * Recursive condition tree allowing for deep nesting.
 * Arrays at the root are treated as implicit ANDs.
 */
export type QueryCondition =
	| { AND: QueryCondition[] }
	| { OR: QueryCondition[] }
	| { NOT: QueryCondition }
	| {
			column: string;
			/** Optional JSON path to extract, e.g., 'field' or 'nested.field' */
			jsonPath?: string;
			op: FilterOp;
			/** Pass value to bind it. Omit to just output the positional placeholder. */
			value?: any;
			/** Used for IN or BETWEEN */
			values?: any[];
			/** Used to generate a specific number of placeholders for IN clauses without binding values */
			placeholderCount?: number;
			/** Raw SQL literal for the right-hand side — caller is responsible for quoting/escaping */
			raw?: string;
	  };

export interface QueryField {
	column?: string;
	/** Optional JSON path to extract */
	jsonPath?: string;
	raw?: string; // Arbitrary SQL string for the projection (e.g., "1")
	alias?: string;
	agg?: "count" | "sum" | "avg" | "min" | "max" | "count_distinct";
}
export type QuerySort = {
	column: string;
	/** Optional JSON path to extract */
	jsonPath?: string;
	direction: "ASC" | "DESC";
	nulls?: "FIRST" | "LAST";
};

export type ColumnType =
	| "id" // short text primary key
	| "uuid" // native UUID in pg/duckdb, text in sqlite
	| "text"
	| "json" // stored as text/jsonb depending on dialect
	| "int"
	| "real"
	| "bool" // stored as 0/1 in sqlite, boolean in pg
	| "timestamp"
	| "blob";

export interface ColumnDef {
	name: string;
	type: ColumnType | string; // Fallback to raw string if specific dialect type needed
	nullable?: boolean;
	default?: "now" | string | number | null;
	defaultRaw?: string; // Used for functions, e.g., "gen_random_uuid()" or "uuid()" without string quotes
	autoIncrement?: boolean; // integer PK, sqlite AUTOINCREMENT / pg SERIAL
	primaryKey?: boolean;
	unique?: boolean;
	check?: string; // e.g. "length(name) > 0"
	raw?: string; // Arbitrary constraint strings like "REFERENCES other(id) ON DELETE CASCADE"
}

export interface ForeignKeyDef {
	columns: string[];
	refTable: string;
	refColumns: string[];
	onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION" | string;
	onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION" | string;
}

export interface CreateTableQuery {
	table: string;
	ifNotExists?: boolean; // Defaults to true internally
	columns: ColumnDef[];
	primaryKey?: string[]; // Composite primary key
	foreignKeys?: ForeignKeyDef[];
	uniques?: string[][]; // Composite unique indexes
	checks?: string[]; // Table level checks
}

export interface CreateIndexQuery {
	table: string;
	name: string;
	columns: string[];
	unique?: boolean;
	ifNotExists?: boolean; // Defaults to true
	using?: string; // e.g., "GIN" for Postgres JSONB indexing
	where?: string; // e.g., raw SQL for a partial index "status = 'active'"
}

export interface SelectQuery {
	table: string;
	select?: QueryField[]; // Defaults to ['*'] if empty
	where?: QueryCondition[]; // Top level array is treated as implicit AND
	groupBy?: (string | { column: string; jsonPath?: string })[];
	having?: QueryCondition[];
	orderBy?: QuerySort[];
	limit?: number;
	offset?: number;
}

export interface InsertQuery {
	table: string;
	values?: Record<string, any> | Record<string, any>[];
	columns?: string[];
	columnLiterals?: Record<string, string>;
	returning?: string[];
	onConflict?: "ignore" | "replace" | string;
	conflictColumns?: string[];
}

export interface UpdateQuery {
	table: string;
	set?: Record<string, any>;
	setColumns?: string[]; // Use this to generate a prepared statement without bound values
	where?: QueryCondition[];
	returning?: string[];
}

export interface DeleteQuery {
	table: string;
	where?: QueryCondition[];
	returning?: string[];
}

export interface PragmaQuery {
	pragma: string;
	value?: string;
}

/**
 * Helper class to track positional parameters recursively during AST traversal.
 */
class CompilerContext {
	public params: any[] = [];
	private paramIndex = 1;

	constructor(private dialect: SqlDialect) {}

	/** Adds a parameter and returns its placeholder string (e.g. $1 or ?) */
	public addParam(value: any): string {
		this.params.push(value);
		return this.nextPlaceholder();
	}

	/** Returns the next placeholder string WITHOUT adding a parameter value */
	public nextPlaceholder(): string {
		const placeholder =
			this.dialect === "postgres" ? `$${this.paramIndex}` : "?";
		this.paramIndex++;
		return placeholder;
	}
}

/**
 * Unified SQL AST Compiler supporting SQLite, Postgres, and DuckDB.
 */
export class QueryCompiler {
	constructor(private dialect: SqlDialect = "sqlite") {}

	/** Safe identifier quoting (ANSI standard double quotes) */
	private quoteIdent(ident: string): string {
		return `"${ident.replace(/"/g, '""')}"`;
	}

	/** Helper to extract JSON paths consistently across dialects */
	private formatColumn(colName: string, jsonPath?: string): string {
		if (!jsonPath) return this.quoteIdent(colName);

		const quotedCol = this.quoteIdent(colName);

		if (this.dialect === "postgres") {
			// If the path has dots (e.g., "history.priorAcceptCount"),
			// use postgres path extraction array '#>>' instead of '->>'
			const pathParts = jsonPath.split(".");
			if (pathParts.length > 1) {
				return `${quotedCol}::jsonb #>> '{${pathParts.join(",")}}'`;
			}
			return `${quotedCol}::jsonb ->> '${jsonPath}'`;
		}
		if (this.dialect === "duckdb") {
			return `json_extract_string(${quotedCol}, '$.${jsonPath}')`;
		}
		// SQLite fallback
		return `json_extract(${quotedCol}, '$.${jsonPath}')`;
	}

	private columnSqlType(col: ColumnDef): string {
		if (col.autoIncrement) {
			return this.dialect === "postgres" ? "SERIAL" : "INTEGER";
		}
		switch (col.type) {
			case "id":
			case "text":
				return "TEXT";
			case "uuid":
				return this.dialect === "sqlite" ? "TEXT" : "UUID";
			case "json":
				return this.dialect === "postgres" ? "JSONB" : "TEXT";
			case "int":
				return "INTEGER";
			case "real":
				return this.dialect === "postgres" ? "DOUBLE PRECISION" : "REAL";
			case "bool":
				return this.dialect === "postgres"
					? "BOOLEAN"
					: this.dialect === "duckdb"
						? "BOOLEAN"
						: "INTEGER";
			case "timestamp":
				return this.dialect === "postgres"
					? "TIMESTAMP WITH TIME ZONE"
					: this.dialect === "duckdb"
						? "TIMESTAMP"
						: "TEXT";
			case "blob":
				return this.dialect === "postgres" ? "BYTEA" : "BLOB";
			default:
				return col.type; // raw specific string passed directly
		}
	}

	private columnDefaultSql(col: ColumnDef): string {
		if (col.defaultRaw !== undefined) {
			return ` DEFAULT ${col.defaultRaw}`;
		}
		if (col.default === undefined) return "";
		if (col.default === null) return " DEFAULT NULL";
		if (col.default === "now") {
			return " DEFAULT CURRENT_TIMESTAMP";
		}
		if (typeof col.default === "number") return ` DEFAULT ${col.default}`;
		return ` DEFAULT '${col.default}'`;
	}

	public compileCreateTable(query: CreateTableQuery): CompiledQuery {
		const lines: string[] = [];

		for (const col of query.columns) {
			let line = `${this.quoteIdent(col.name)} ${this.columnSqlType(col)}`;

			if (col.primaryKey) {
				if (col.autoIncrement && this.dialect !== "postgres") {
					line += " PRIMARY KEY AUTOINCREMENT";
				} else {
					line += " PRIMARY KEY";
				}
			} else if (!col.nullable) {
				line += " NOT NULL";
			} else {
				line += " NULL";
			}

			line += this.columnDefaultSql(col);

			if (col.unique) line += " UNIQUE";
			if (col.check) line += ` CHECK (${col.check})`;
			if (col.raw) line += ` ${col.raw}`;

			lines.push(line);
		}

		if (query.primaryKey && query.primaryKey.length > 0) {
			lines.push(
				`PRIMARY KEY (${query.primaryKey.map((c) => this.quoteIdent(c)).join(", ")})`,
			);
		}

		for (const uniq of query.uniques ?? []) {
			lines.push(`UNIQUE (${uniq.map((c) => this.quoteIdent(c)).join(", ")})`);
		}

		for (const fk of query.foreignKeys ?? []) {
			let line =
				`FOREIGN KEY (${fk.columns.map((c) => this.quoteIdent(c)).join(", ")}) ` +
				`REFERENCES ${this.quoteIdent(fk.refTable)} (${fk.refColumns.map((c) => this.quoteIdent(c)).join(", ")})`;
			if (fk.onDelete) line += ` ON DELETE ${fk.onDelete}`;
			if (fk.onUpdate) line += ` ON UPDATE ${fk.onUpdate}`;
			lines.push(line);
		}

		for (const chk of query.checks ?? []) {
			lines.push(`CHECK (${chk})`);
		}

		const ifNotExists = query.ifNotExists !== false ? "IF NOT EXISTS " : "";
		const sql = `CREATE TABLE ${ifNotExists}${this.quoteIdent(query.table)} (\n  ${lines.join(",\n  ")}\n);`;

		return { sql, params: [] };
	}

	public compileCreateIndex(query: CreateIndexQuery): CompiledQuery {
		const uniqueStr = query.unique ? "UNIQUE " : "";
		const ifNotExists = query.ifNotExists !== false ? "IF NOT EXISTS " : "";
		const usingStr = query.using ? ` USING ${query.using}` : "";

		// If a column specifies raw function mappings (e.g. `(data->>'tag')`), leave it unquoted
		const cols = query.columns
			.map((c) =>
				c.startsWith("(") || c.includes(" ") ? c : this.quoteIdent(c),
			)
			.join(", ");

		let sql = `CREATE ${uniqueStr}INDEX ${ifNotExists}${this.quoteIdent(query.name)} ON ${this.quoteIdent(query.table)}${usingStr} (${cols})`;

		if (query.where) {
			sql += ` WHERE ${query.where}`;
		}

		return { sql: sql + ";", params: [] };
	}

	private compileCondition(cond: QueryCondition, ctx: CompilerContext): string {
		if ("AND" in cond) {
			if (cond.AND.length === 0) return "1=1";
			return `(${cond.AND.map((c) => this.compileCondition(c, ctx)).join(" AND ")})`;
		}
		if ("OR" in cond) {
			if (cond.OR.length === 0) return "1=0";
			return `(${cond.OR.map((c) => this.compileCondition(c, ctx)).join(" OR ")})`;
		}
		if ("NOT" in cond) {
			return `NOT (${this.compileCondition(cond.NOT, ctx)})`;
		}

		// Base condition
		const col = this.formatColumn(cond.column, cond.jsonPath);
		const hasValue = "value" in cond && cond.value !== undefined;
		const hasValues = "values" in cond && cond.values !== undefined;

		// Determine the right side of the expression
		let rhs = "";
		if ("raw" in cond && cond.raw !== undefined) {
			rhs = cond.raw;
		} else if (hasValue && cond.op !== "json_contains") {
			rhs = ctx.addParam(cond.value);
		} else if (hasValues) {
			rhs = `(${cond.values!.map((v) => ctx.addParam(v)).join(", ")})`;
		} else if (cond.placeholderCount) {
			// e.g., IN (?, ?, ?) when passing just the structure
			const placeholders = Array.from({ length: cond.placeholderCount }, () =>
				ctx.nextPlaceholder(),
			);
			rhs = `(${placeholders.join(", ")})`;
		} else if (cond.op !== "is_null" && cond.op !== "is_not_null") {
			// Prepared statement positional placeholder logic
			rhs = ctx.nextPlaceholder();
		}

		switch (cond.op) {
			case "eq":
				return `${col} = ${rhs}`;
			case "neq":
				return `${col} != ${rhs}`;
			case "gt":
				return `${col} > ${rhs}`;
			case "geq":
				return `${col} >= ${rhs}`;
			case "lt":
				return `${col} < ${rhs}`;
			case "leq":
				return `${col} <= ${rhs}`;
			case "like":
				return `${col} LIKE ${rhs}`;
			case "not_like":
				return `${col} NOT LIKE ${rhs}`;
			case "ilike":
				return this.dialect === "sqlite"
					? `${col} LIKE ${rhs}`
					: `${col} ILIKE ${rhs}`;
			case "not_ilike":
				return this.dialect === "sqlite"
					? `${col} NOT LIKE ${rhs}`
					: `${col} NOT ILIKE ${rhs}`;
			case "starts_with":
				return `${col} LIKE ${hasValue ? ctx.addParam(`${cond.value}%`) : `CONCAT(${rhs}, '%')`}`;
			case "ends_with":
				return `${col} LIKE ${hasValue ? ctx.addParam(`%${cond.value}`) : `CONCAT('%', ${rhs})`}`;
			case "str_contains":
				return `${col} LIKE ${hasValue ? ctx.addParam(`%${cond.value}%`) : `CONCAT('%', ${rhs}, '%')`}`;
			case "in_set":
				return `${col} IN ${rhs}`;
			case "not_in_set":
				return `${col} NOT IN ${rhs}`;
			case "between": {
				if (hasValues && cond.values!.length === 2) {
					// Pre-bound: BETWEEN ? AND ?
					return `${col} BETWEEN ${rhs}`; // Note: rhs here is `(?, ?)` which is invalid syntax for BETWEEN, handled properly below
				}
				// Standard explicit placeholder usage for BETWEEN
				const b1 = hasValues
					? ctx.addParam(cond.values![0])
					: ctx.nextPlaceholder();
				const b2 = hasValues
					? ctx.addParam(cond.values![1])
					: ctx.nextPlaceholder();
				return `${col} BETWEEN ${b1} AND ${b2}`;
			}
			case "not_between": {
				const nb1 = hasValues
					? ctx.addParam(cond.values![0])
					: ctx.nextPlaceholder();
				const nb2 = hasValues
					? ctx.addParam(cond.values![1])
					: ctx.nextPlaceholder();
				return `${col} NOT BETWEEN ${nb1} AND ${nb2}`;
			}
			case "is_null":
				return `${col} IS NULL`;
			case "is_not_null":
				return `${col} IS NOT NULL`;
			case "json_contains": {
				if (this.dialect === "postgres") {
					return `${col}::jsonb @> ${ctx.addParam(JSON.stringify([cond.value]))}::jsonb`;
				}
				// SQLite/DuckDB: no native array-containment operator, but json_each gives
				// real correctness (safer than LIKE, which could false-positive on
				// JSON-escaped characters inside tag strings).
				return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ${ctx.addParam(cond.value)})`;
			}
			default:
				throw new Error(`Unsupported filter op: ${(cond as any).op}`);
		}
	}

	private compileWhereBlock(
		conditions: QueryCondition[] | undefined,
		ctx: CompilerContext,
	): string {
		if (!conditions || conditions.length === 0) return "";
		const combined: QueryCondition = { AND: conditions };
		return `\nWHERE ${this.compileCondition(combined, ctx)}`;
	}

	public compileSelect(query: SelectQuery): CompiledQuery {
		const ctx = new CompilerContext(this.dialect);
		let sql = "SELECT ";

		if (!query.select || query.select.length === 0) {
			sql += "*";
		} else {
			const fields = query.select.map((f) => {
				let expr = f.raw ? f.raw : this.formatColumn(f.column!, f.jsonPath);
				if (f.agg) {
					if (f.agg === "count_distinct") {
						expr = `COUNT(DISTINCT ${expr})`;
					} else {
						expr = `${f.agg.toUpperCase()}(${expr})`;
					}
				}
				if (f.alias) {
					expr += ` AS ${this.quoteIdent(f.alias)}`;
				}
				return expr;
			});
			sql += fields.join(", ");
		}

		sql += `\nFROM ${this.quoteIdent(query.table)}`;
		sql += this.compileWhereBlock(query.where, ctx);

		if (query.groupBy && query.groupBy.length > 0) {
			const groupings = query.groupBy.map((c) => {
				if (typeof c === "string") return this.quoteIdent(c);
				return this.formatColumn(c.column, c.jsonPath);
			});
			sql += `\nGROUP BY ${groupings.join(", ")}`;
		}

		if (query.having && query.having.length > 0) {
			const combined: QueryCondition = { AND: query.having };
			sql += `\nHAVING ${this.compileCondition(combined, ctx)}`;
		}

		if (query.orderBy && query.orderBy.length > 0) {
			const sorts = query.orderBy.map((s) => {
				let sortStr = `${this.formatColumn(s.column, s.jsonPath)} ${s.direction}`;
				if (s.nulls) {
					sortStr += ` NULLS ${s.nulls}`;
				}
				return sortStr;
			});
			sql += `\nORDER BY ${sorts.join(", ")}`;
		}

		if (query.limit !== undefined) {
			sql += `\nLIMIT ${query.limit}`;
		}
		if (query.offset !== undefined) {
			sql += `\nOFFSET ${query.offset}`;
		}

		return { sql: sql + ";", params: ctx.params };
	}

	private getKeysAndValues(data: Record<string, any> | Record<string, any>[]): {
		columns: string[];
		rows: any[][];
	} {
		const arrayData = Array.isArray(data) ? data : [data];
		if (arrayData.length === 0) return { columns: [], rows: [] };

		const columns = Object.keys(arrayData[0]);
		const rows = arrayData.map((item) => columns.map((col) => item[col]));
		return { columns, rows };
	}

	public compileInsert(query: InsertQuery): CompiledQuery {
		const ctx = new CompilerContext(this.dialect);
		let quotedCols = "";
		let valueStrings: string[] = [];
		let activeColumns: string[] = [];

		if (query.values) {
			const { columns, rows } = this.getKeysAndValues(query.values);
			if (columns.length === 0) {
				throw new Error("InsertQuery requires at least one value column");
			}
			activeColumns = columns;
			quotedCols = columns.map((c) => this.quoteIdent(c)).join(", ");
			valueStrings = rows.map((rowVals) => {
				const placeholders = rowVals.map((val) => ctx.addParam(val));
				return `(${placeholders.join(", ")})`;
			});
		} else if (query.columns) {
			if (query.columns.length === 0) {
				throw new Error("InsertQuery requires at least one column");
			}
			activeColumns = query.columns;
			quotedCols = query.columns.map((c) => this.quoteIdent(c)).join(", ");
			const placeholders = query.columns.map(
				(c) => query.columnLiterals?.[c] ?? ctx.nextPlaceholder(),
			);
			valueStrings = [`(${placeholders.join(", ")})`];
		} else {
			throw new Error("InsertQuery requires either 'values' or 'columns'");
		}

		let insertKeyword = "INSERT";
		let onConflictClause = "";

		if (query.onConflict === "ignore") {
			if (this.dialect === "sqlite" || this.dialect === "duckdb") {
				insertKeyword = "INSERT OR IGNORE";
			} else {
				onConflictClause = "ON CONFLICT DO NOTHING";
			}
		} else if (query.onConflict === "replace") {
			if (this.dialect === "sqlite") {
				insertKeyword = "INSERT OR REPLACE";
			} else {
				// Postgres / DuckDB explicit replace resolution mapping
				if (!query.conflictColumns || query.conflictColumns.length === 0) {
					throw new Error(
						"InsertQuery with onConflict='replace' requires 'conflictColumns' for Postgres/DuckDB",
					);
				}
				const conflictCols = query.conflictColumns
					.map((c) => this.quoteIdent(c))
					.join(", ");
				const updateCols = activeColumns.filter(
					(c) => !query.conflictColumns!.includes(c),
				);

				if (updateCols.length > 0) {
					const setClause = updateCols
						.map(
							(c) => `${this.quoteIdent(c)} = EXCLUDED.${this.quoteIdent(c)}`,
						)
						.join(",\n  ");
					onConflictClause = `ON CONFLICT (${conflictCols}) DO UPDATE SET\n  ${setClause}`;
				} else {
					onConflictClause = `ON CONFLICT (${conflictCols}) DO NOTHING`; // Fallback if no non-key cols exist
				}
			}
		}

		let sql = `${insertKeyword} INTO ${this.quoteIdent(query.table)} (${quotedCols})\nVALUES ${valueStrings.join(", ")}`;

		if (onConflictClause) {
			sql += `\n${onConflictClause}`;
		}

		if (query.returning && query.returning.length > 0) {
			sql += `\nRETURNING ${query.returning.map((c) => this.quoteIdent(c)).join(", ")}`;
		}

		return { sql: sql + ";", params: ctx.params };
	}

	public compileUpdate(query: UpdateQuery): CompiledQuery {
		const ctx = new CompilerContext(this.dialect);
		let sql = `UPDATE ${this.quoteIdent(query.table)}\nSET `;

		if (query.set) {
			const setKeys = Object.keys(query.set);
			if (setKeys.length === 0)
				throw new Error("UpdateQuery requires at least one field to set");

			const setClauses = setKeys.map((key) => {
				const valPlaceholder = ctx.addParam(query.set![key]);
				return `${this.quoteIdent(key)} = ${valPlaceholder}`;
			});
			sql += setClauses.join(", ");
		} else if (query.setColumns) {
			if (query.setColumns.length === 0)
				throw new Error("UpdateQuery requires at least one setColumn");

			const setClauses = query.setColumns.map((key) => {
				return `${this.quoteIdent(key)} = ${ctx.nextPlaceholder()}`;
			});
			sql += setClauses.join(", ");
		} else {
			throw new Error("UpdateQuery requires either 'set' or 'setColumns'");
		}

		sql += this.compileWhereBlock(query.where, ctx);

		if (query.returning && query.returning.length > 0) {
			sql += `\nRETURNING ${query.returning.map((c) => this.quoteIdent(c)).join(", ")}`;
		}

		return { sql: sql + ";", params: ctx.params };
	}

	public compileDelete(query: DeleteQuery): CompiledQuery {
		const ctx = new CompilerContext(this.dialect);
		let sql = `DELETE FROM ${this.quoteIdent(query.table)}`;
		sql += this.compileWhereBlock(query.where, ctx);
		if (query.returning && query.returning.length > 0) {
			sql += `\nRETURNING ${query.returning.map((c) => this.quoteIdent(c)).join(", ")}`;
		}
		return { sql: sql + ";", params: ctx.params };
	}

	/**
	 * Wraps a pre-compiled SQL string or CompiledQuery in a transaction block.
	 * (BEGIN ... COMMIT)
	 */
	public wrapInTransaction(query: string): string;
	public wrapInTransaction(query: CompiledQuery): CompiledQuery;
	public wrapInTransaction(
		query: string | CompiledQuery,
	): string | CompiledQuery {
		if (typeof query === "string") {
			return `BEGIN;\n${query.trim()}\nCOMMIT;`;
		}
		return {
			sql: `BEGIN;\n${query.sql.trim()}\nCOMMIT;`,
			params: query.params,
		};
	}

	/**
	 * Emits a PRAGMA statement for SQLite/DuckDB (e.g., "journal_mode", "WAL").
	 * Returns an empty string for Postgres as these are typically SQLite-specific.
	 */
	public compilePragma(pragma: string, value: string | number): string {
		if (this.dialect === "postgres") {
			return ""; // Postgres doesn't use SQLite PRAGMAs
		}
		return `PRAGMA ${pragma} = ${value};`;
	}

	/**
	 * Batches multiple DDL statements (or raw queries) into a single string
	 * separated by double newlines, suitable for repo initSchema() execution.
	 */
	public compileDDLBatch(queries: (string | CompiledQuery)[]): string {
		return queries
			.map((q) => (typeof q === "string" ? q : q.sql).trim())
			.filter((q) => q.length > 0)
			.join("\n\n");
	}

	/**
	 * Convenience method for an Upsert/Replace operation.
	 * Maps to INSERT OR REPLACE in SQLite, and ON CONFLICT DO UPDATE in Postgres/DuckDB.
	 * Note: Postgres and DuckDB require `conflictColumns` to be specified.
	 */
	public compileReplace(query: Omit<InsertQuery, "onConflict">): CompiledQuery {
		return this.compileInsert({ ...query, onConflict: "replace" });
	}
	/**
	 * Compiles scalar pipeline functions across SQLite, Postgres, and DuckDB.
	 * Assumes arguments are already properly escaped/bound strings (e.g. "?", "$1", or literal strings/numbers).
	 */
	public compileScalarExpression(
		op: SqlFunctionOp | string,
		args: string[],
	): string {
		const arg0 = args[0] || "NULL";

		switch (op) {
			case "year":
				return this.dialect === "sqlite"
					? `CAST(strftime('%Y', ${arg0}) AS INTEGER)`
					: `EXTRACT(YEAR FROM CAST(${arg0} AS TIMESTAMP))`;
			case "month":
				return this.dialect === "sqlite"
					? `CAST(strftime('%m', ${arg0}) AS INTEGER)`
					: `EXTRACT(MONTH FROM CAST(${arg0} AS TIMESTAMP))`;
			case "day":
				return this.dialect === "sqlite"
					? `CAST(strftime('%d', ${arg0}) AS INTEGER)`
					: `EXTRACT(DAY FROM CAST(${arg0} AS TIMESTAMP))`;
			case "quarter":
				return this.dialect === "sqlite"
					? `CAST((strftime('%m', ${arg0}) + 2) / 3 AS INTEGER)`
					: `EXTRACT(QUARTER FROM CAST(${arg0} AS TIMESTAMP))`;
			case "date_diff": {
				const arg1 = args[1] || "NULL";
				return this.dialect === "sqlite"
					? `(julianday(${arg1}) - julianday(${arg0}))`
					: `DATE_PART('day', CAST(${arg1} AS TIMESTAMP) - CAST(${arg0} AS TIMESTAMP))`;
			}
			case "to_string":
				return `CAST(${arg0} AS TEXT)`;
			case "to_number": {
				const mode =
					args[1] && (args[1] === "'int'" || args[1] === "'integer'")
						? "INTEGER"
						: this.dialect === "sqlite"
							? "REAL"
							: "NUMERIC";
				return `CAST(${arg0} AS ${mode})`;
			}
			case "round": {
				const decimals = args[1] ?? "0";
				return this.dialect === "sqlite"
					? `ROUND(${arg0}, ${decimals})`
					: `ROUND(CAST(${arg0} AS NUMERIC), ${decimals})`;
			}
			case "ceil":
				return this.dialect === "sqlite" ? `CEIL(${arg0})` : `CEILING(${arg0})`;
			case "floor":
				return `FLOOR(${arg0})`;
			case "starts_with": {
				const patterns = args.slice(1);
				if (patterns.length === 0) return "1=1";
				const conds = patterns.map((p) =>
					this.dialect === "sqlite"
						? `${arg0} LIKE ${p} || '%'`
						: `${arg0} LIKE CONCAT(${p}, '%')`,
				);
				return `(${conds.join(" OR ")})`;
			}
			case "ends_with": {
				const patterns = args.slice(1);
				if (patterns.length === 0) return "1=1";
				const conds = patterns.map((p) =>
					this.dialect === "sqlite"
						? `${arg0} LIKE '%' || ${p}`
						: `${arg0} LIKE CONCAT('%', ${p})`,
				);
				return `(${conds.join(" OR ")})`;
			}
			case "str_contains": {
				let patterns = args.slice(1);
				let mode = "all";
				const last = patterns[patterns.length - 1];
				if (last === "'any'" || last === "'all'") {
					mode = last === "'any'" ? "any" : "all";
					patterns = patterns.slice(0, -1);
				}
				if (patterns.length === 0) return "1=1";
				const conds = patterns.map((p) =>
					this.dialect === "sqlite"
						? `${arg0} LIKE '%' || ${p} || '%'`
						: `${arg0} LIKE CONCAT('%', ${p}, '%')`,
				);
				const joiner = mode === "any" ? " OR " : " AND ";
				return `(${conds.join(joiner)})`;
			}
			case "substring": {
				const start = args[1] ?? "0";
				return this.dialect === "sqlite"
					? `SUBSTR(${arg0}, (${start}) + 1${args[2] !== undefined ? `, ${args[2]}` : ""})`
					: `SUBSTRING(${arg0} FROM (${start}) + 1${args[2] !== undefined ? ` FOR ${args[2]}` : ""})`;
			}
			case "trim":
				return `TRIM(${arg0})`;
			case "lower":
				return `LOWER(${arg0})`;
			case "upper":
				return `UPPER(${arg0})`;
			case "concat":
				return this.dialect === "sqlite"
					? `(${args.join(" || ")})`
					: `CONCAT(${args.join(", ")})`;
			default:
				throw new Error(`Pipeline compiler: unsupported op "${op}"`);
		}
	}
}
