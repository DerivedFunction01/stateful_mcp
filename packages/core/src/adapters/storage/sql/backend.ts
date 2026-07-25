import { Database } from "bun:sqlite";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { Pool, type PoolClient } from "pg";
import {
	QueryCompiler,
	type SqlDialect,
} from "../../../translation/sql-compiler";

export interface SqlStatement {
	sql: string;
	params: any[];
}

type NativeConn = Database | Pool | DuckDBConnection;

export class SqlBackend {
	public readonly compiler: QueryCompiler;
	private constructor(
		public readonly dialect: SqlDialect,
		private conn: NativeConn,
	) {
		this.compiler = new QueryCompiler(dialect);
	}

	static async connect(
		dialect: SqlDialect,
		target: string,
	): Promise<SqlBackend> {
		switch (dialect) {
			case "sqlite": {
				const { dirname } = await import("path");
				const { existsSync, mkdirSync } = await import("fs");
				const dir = dirname(target);
				if (dir !== "." && !existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}
				return new SqlBackend("sqlite", new Database(target));
			}
			case "duckdb": {
				const instance = await DuckDBInstance.create(target, {
					allow_unsigned_extensions: "true",
				});
				return new SqlBackend("duckdb", await instance.connect());
			}
			case "postgres":
				return new SqlBackend(
					"postgres",
					new Pool({ connectionString: target }),
				);
			default: {
				const _exhaustive: never = dialect;
				throw new Error(`Unhandled dialect: ${_exhaustive}`);
			}
		}
	}

	async exec(sql: string, params: any[] = []): Promise<void> {
		switch (this.dialect) {
			case "sqlite":
				(this.conn as Database).run(sql, ...params);
				return;
			case "duckdb":
				await (this.conn as DuckDBConnection).run(sql, params);
				return;
			case "postgres":
				await (this.conn as Pool).query(sql, params);
				return;
		}
	}

	async query(sql: string, params: any[] = []): Promise<Record<string, any>[]> {
		switch (this.dialect) {
			case "sqlite":
				return (this.conn as Database).query(sql).all(...params) as Record<
					string,
					any
				>[];
			case "duckdb": {
				const reader = await (this.conn as DuckDBConnection).runAndReadAll(
					sql,
					params,
				);
				return reader.getRowObjectsJS().map((r: any) => this.coerceDuckRow(r));
			}
			case "postgres": {
				const res = await (this.conn as Pool).query(sql, params);
				return res.rows.map((r: any) => this.coercePgRow(r));
			}
		}
	}

	async queryOne(
		sql: string,
		params: any[] = [],
	): Promise<Record<string, any> | null> {
		const rows = await this.query(sql, params);
		return rows[0] ?? null;
	}

	async transaction(statements: SqlStatement[]): Promise<void> {
		switch (this.dialect) {
			case "sqlite": {
				const db = this.conn as Database;
				const runTx = db.transaction(() => {
					for (const { sql, params } of statements) {
						db.run(sql, ...params);
					}
				});
				runTx();
				return;
			}
			case "duckdb": {
				const conn = this.conn as DuckDBConnection;
				await conn.run("BEGIN");
				try {
					for (const { sql, params } of statements) await conn.run(sql, params);
					await conn.run("COMMIT");
				} catch (e) {
					await conn.run("ROLLBACK");
					throw e;
				}
				return;
			}
			case "postgres": {
				const pool = this.conn as Pool;
				const client: PoolClient = await pool.connect();
				try {
					await client.query("BEGIN");
					for (const { sql, params } of statements)
						await client.query(sql, params);
					await client.query("COMMIT");
				} catch (e) {
					await client.query("ROLLBACK");
					throw e;
				} finally {
					client.release();
				}
				return;
			}
		}
	}

	async execStatements(statements: SqlStatement[]): Promise<void> {
		for (const { sql, params } of statements) {
			await this.exec(sql, params);
		}
	}

	private coerceDuckRow(row: Record<string, any>): Record<string, any> {
		const out: Record<string, any> = {};
		for (const [k, v] of Object.entries(row)) {
			if (v === null || v === undefined) {
				out[k] = v;
			} else if (
				typeof v === "string" ||
				typeof v === "number" ||
				typeof v === "boolean"
			) {
				out[k] = v;
			} else if (v instanceof Date) {
				out[k] = v.toISOString();
			} else {
				out[k] = String(v);
			}
		}
		return out;
	}

	private coercePgRow(row: Record<string, any>): Record<string, any> {
		const out: Record<string, any> = {};
		for (const [k, v] of Object.entries(row)) {
			if (v instanceof Date) {
				out[k] = v.toISOString();
			} else {
				out[k] = v;
			}
		}
		return out;
	}
}
