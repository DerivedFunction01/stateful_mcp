import { Database } from "bun:sqlite";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { Pool, type PoolClient } from "pg";
import type {
	EffectiveStorePolicy,
	StorageOperation,
} from "../../../storage/contracts";
import {
	QueryCompiler,
	type SqlDialect,
} from "../../../translation/sql-compiler";
import { OpfsDb } from "./opfs-backend";
import { SqlPermissionPolicy } from "./permission-policy";

export interface SqlStatement {
	sql: string;
	params: any[];
}

type NativeConn = Database | Pool | DuckDBConnection | OpfsDb;

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
		policy?: EffectiveStorePolicy,
	): Promise<SqlBackend> {
		switch (dialect) {
			case "sqlite": {
				const { dirname } = await import("path");
				const { existsSync, mkdirSync } = await import("fs");
				const dir = dirname(target);
				if (dir !== "." && !existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}
				const backend = new SqlBackend("sqlite", new Database(target));
				backend.setPermissionPolicy(policy);
				return backend;
			}
			case "duckdb": {
				let dbPath = target;
				let schema: Record<string, string> | undefined;

				if (target.trim().startsWith("{")) {
					try {
						const parsed = JSON.parse(target);
						dbPath = parsed.path || ":memory:";
						schema = parsed.schema;
					} catch (_) {}
				}

				const instance = await DuckDBInstance.create(dbPath, {
					allow_unsigned_extensions: "true",
				});
				const connection = await instance.connect();
				const backend = new SqlBackend("duckdb", connection);

				if (schema) {
					for (const [tableName, filePath] of Object.entries(schema)) {
						const ext = filePath.toLowerCase();
						let query = "";
						if (ext.endsWith(".parquet")) {
							query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_parquet('${filePath}')`;
						} else if (ext.endsWith(".jsonl") || ext.endsWith(".json")) {
							query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_json_auto('${filePath}')`;
						} else if (ext.endsWith(".csv")) {
							query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_csv_auto('${filePath}')`;
						} else {
							query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM '${filePath}'`;
						}
						await connection.run(query);
					}
				}

				backend.setPermissionPolicy(policy);
				return backend;
			}
			case "postgres": {
				const backend = new SqlBackend(
					"postgres",
					new Pool({ connectionString: target }),
				);
				backend.setPermissionPolicy(policy);
				return backend;
			}
			case "opfs": {
				const opfsDb = new OpfsDb(target);
				await opfsDb.open();
				const backend = new SqlBackend("opfs", opfsDb);
				backend.setPermissionPolicy(policy);
				return backend;
			}
			default: {
				const _exhaustive: never = dialect;
				throw new Error(`Unhandled dialect: ${_exhaustive}`);
			}
		}
	}

	private permissionPolicy = new SqlPermissionPolicy();

	setPermissionPolicy(policy?: EffectiveStorePolicy): void {
		this.permissionPolicy = new SqlPermissionPolicy(policy);
	}

	get diagnostics() {
		return this.permissionPolicy.diagnostics;
	}

	get schemaMode() {
		return this.permissionPolicy.policy.schemaMode ?? "initialize";
	}

	async exec(sql: string, params: any[] = []): Promise<void> {
		const operation: StorageOperation = "write";
		if (!this.permissionPolicy.allows(operation)) {
			this.permissionPolicy.record(operation, "skipped_read_only");
			return;
		}
		this.permissionPolicy.record(operation, "applied");
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
			case "opfs":
				await (this.conn as OpfsDb).exec(sql, params);
				return;
		}
	}

	async query(sql: string, params: any[] = []): Promise<Record<string, any>[]> {
		if (!this.permissionPolicy.allows("read")) {
			this.permissionPolicy.record("read", "skipped_read_only");
			return [];
		}
		this.permissionPolicy.record("read", "applied");
		switch (this.dialect) {
			case "sqlite": {
				const db = this.conn as Database;
				return db
					.query(sql)
					.all(...params)
					.map((r: any) => this.normalizeJsonValues(r));
			}
			case "opfs": {
				const rows = await (this.conn as OpfsDb).query(sql, params);
				return rows.map((r: any) => this.normalizeJsonValues(r));
			}
			case "duckdb": {
				const reader = await (this.conn as DuckDBConnection).runAndReadAll(
					sql,
					params,
				);
				return reader
					.getRowObjectsJS()
					.map((r: any) => this.normalizeJsonValues(r));
			}
			case "postgres": {
				const res = await (this.conn as Pool).query(sql, params);
				return res.rows.map((r: any) => this.normalizeJsonValues(r));
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
		if (!this.permissionPolicy.allows("write")) {
			this.permissionPolicy.record("write", "skipped_read_only");
			return;
		}
		this.permissionPolicy.record("write", "applied");
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
			case "opfs": {
				const opfs = this.conn as OpfsDb;
				await opfs.exec("BEGIN IMMEDIATE");
				try {
					for (const { sql, params } of statements)
						await opfs.exec(sql, params);
					await opfs.exec("COMMIT");
				} catch (e) {
					await opfs.exec("ROLLBACK");
					throw e;
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

	private normalizeJsonValues(row: Record<string, any>): Record<string, any> {
		const out: Record<string, any> = {};
		for (const [k, v] of Object.entries(row)) {
			if (v === null || v === undefined) {
				out[k] = v;
			} else if (typeof v === "string") {
				const trimmed = v.trim();
				if (
					(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
					(trimmed.startsWith("[") && trimmed.endsWith("]"))
				) {
					try {
						out[k] = JSON.parse(trimmed);
					} catch {
						out[k] = v;
					}
				} else {
					out[k] = v;
				}
			} else if (typeof v === "number" || typeof v === "boolean") {
				out[k] = v;
			} else if (typeof v === "bigint") {
				out[k] = Number(v);
			} else if (v instanceof Date) {
				out[k] = v.toISOString();
			} else {
				out[k] = JSON.parse(JSON.stringify(v));
			}
		}
		return out;
	}
}
