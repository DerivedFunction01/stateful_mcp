import { Pool } from "pg";
import type { EntityStore } from "./interfaces";

export class PgEntityStore<T> implements EntityStore<T> {
	private pool: Pool;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	constructor(
		poolOrConnectionString: Pool | string,
		private tableName: string,
	) {
		if (typeof poolOrConnectionString === "string") {
			this.pool = new Pool({ connectionString: poolOrConnectionString });
		} else {
			this.pool = poolOrConnectionString;
		}
	}

	private async init(): Promise<void> {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.tableName)) {
				throw new Error(`Invalid Postgres table name: ${this.tableName}`);
			}
			const client = await this.pool.connect();
			try {
				await client.query(`
					CREATE TABLE IF NOT EXISTS ${this.tableName} (
						id TEXT PRIMARY KEY,
						data JSONB NOT NULL
					)
				`);
			} finally {
				client.release();
			}
			this.initialized = true;
		})();

		return this.initPromise;
	}

	async get(id: string): Promise<T | null> {
		await this.init();
		const res = await this.pool.query(
			`SELECT data FROM ${this.tableName} WHERE id = $1`,
			[id],
		);
		if (res.rows.length === 0) return null;
		return res.rows[0].data as T;
	}

	async set(id: string, entity: T): Promise<void> {
		await this.init();
		await this.pool.query(
			`INSERT INTO ${this.tableName} (id, data) VALUES ($1, $2)
			 ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
			[id, JSON.stringify(entity)],
		);
	}

	async list(): Promise<T[]> {
		await this.init();
		const res = await this.pool.query(`SELECT data FROM ${this.tableName}`);
		return res.rows.map((row) => row.data as T);
	}

	async delete(id: string): Promise<void> {
		await this.init();
		await this.pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
	}
}
