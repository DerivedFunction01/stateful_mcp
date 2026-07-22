import type { DuckDBConnection } from "@duckdb/node-api";
import type { EntityStore } from "./interfaces";

export class DuckDbEntityStore<T> implements EntityStore<T> {
	constructor(
		private connection: DuckDBConnection,
		private tableName: string,
	) {
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.tableName)) {
			throw new Error(`Invalid DuckDB table name: ${this.tableName}`);
		}
		this.connection.run(`
			CREATE TABLE IF NOT EXISTS ${this.tableName} (
				id TEXT PRIMARY KEY,
				data TEXT NOT NULL
			)
		`);
	}

	async get(id: string): Promise<T | null> {
		const stmt = await this.connection.prepare(
			`SELECT data FROM ${this.tableName} WHERE id = ?`,
		);
		await stmt.bind([id]);
		const reader = await stmt.run();
		const rows = await reader.getRows();
		if (!rows || rows.length === 0) return null;
		const firstRow = rows[0];
		if (!firstRow) return null;
		const raw = firstRow[0];
		if (typeof raw !== "string") return null;
		return JSON.parse(raw) as T;
	}

	async set(id: string, entity: T): Promise<void> {
		const stmt = await this.connection.prepare(`
			INSERT INTO ${this.tableName} (id, data) VALUES (?, ?)
			ON CONFLICT(id) DO UPDATE SET data = excluded.data
		`);
		await stmt.bind([id, JSON.stringify(entity)]);
		await stmt.run();
	}

	async list(): Promise<T[]> {
		const reader = await this.connection.run(
			`SELECT data FROM ${this.tableName}`,
		);
		const rows = await reader.getRows();
		const results: T[] = [];
		for (const row of rows) {
			const raw = row[0];
			if (typeof raw !== "string") continue;
			results.push(JSON.parse(raw) as T);
		}
		return results;
	}

	async delete(id: string): Promise<void> {
		const stmt = await this.connection.prepare(
			`DELETE FROM ${this.tableName} WHERE id = ?`,
		);
		await stmt.bind([id]);
		await stmt.run();
	}
}
