import type { Database } from "bun:sqlite";
import type { EntityStore } from "./interfaces";

export class MemoryEntityStore<T> implements EntityStore<T> {
	private map = new Map<string, T>();

	async get(id: string): Promise<T | null> {
		return this.map.get(id) || null;
	}

	async set(id: string, entity: T): Promise<void> {
		this.map.set(id, entity);
	}

	async list(): Promise<T[]> {
		return Array.from(this.map.values());
	}

	async delete(id: string): Promise<void> {
		this.map.delete(id);
	}
}

export class SqliteEntityStore<T> implements EntityStore<T> {
	constructor(
		private db: Database,
		private tableName: string,
	) {
		// Safety check: ensure tableName is a valid identifier
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.tableName)) {
			throw new Error(`Invalid SQL table name: ${this.tableName}`);
		}
		this.db.run(`
			CREATE TABLE IF NOT EXISTS ${this.tableName} (
				id TEXT PRIMARY KEY,
				data TEXT NOT NULL
			)
		`);
	}

	async get(id: string): Promise<T | null> {
		const row = this.db
			.query(`SELECT data FROM ${this.tableName} WHERE id = ?`)
			.get(id) as { data: string } | null;
		if (!row) return null;
		return JSON.parse(row.data) as T;
	}

	async set(id: string, entity: T): Promise<void> {
		this.db.run(
			`INSERT INTO ${this.tableName} (id, data) VALUES (?, ?)
			 ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
			[id, JSON.stringify(entity)],
		);
	}

	async list(): Promise<T[]> {
		const rows = this.db
			.query(`SELECT data FROM ${this.tableName}`)
			.all() as Array<{ data: string }>;
		return rows.map((row) => JSON.parse(row.data) as T);
	}

	async delete(id: string): Promise<void> {
		this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
	}
}
