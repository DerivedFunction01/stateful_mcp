// import type { EntityStore, SqlQueryStore } from "./interfaces";
// import type { OpfsDb } from "./opfs-repo";

// export class OpfsEntityStore<T> implements EntityStore<T>, SqlQueryStore {
// 	private initDone = false;

// 	constructor(
// 		private db: OpfsDb,
// 		private tableName: string,
// 	) {}

// 	private async ensureInit(): Promise<void> {
// 		if (this.initDone) return;
// 		await this.db.exec(
// 			`CREATE TABLE IF NOT EXISTS ${this.tableName} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
// 		);
// 		this.initDone = true;
// 	}

// 	async get(id: string): Promise<T | null> {
// 		await this.ensureInit();
// 		const row = await this.db.get<{ data: string }>(
// 			`SELECT data FROM ${this.tableName} WHERE id = ?`,
// 			[id],
// 		);
// 		return row ? (JSON.parse(row.data) as T) : null;
// 	}

// 	async set(id: string, entity: T): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(
// 			`INSERT OR REPLACE INTO ${this.tableName} (id, data) VALUES (?, ?)`,
// 			[id, JSON.stringify(entity)],
// 		);
// 	}

// 	async list(): Promise<T[]> {
// 		await this.ensureInit();
// 		const rows = await this.db.query<{ data: string }>(
// 			`SELECT data FROM ${this.tableName}`,
// 		);
// 		return rows.map((r) => JSON.parse(r.data) as T);
// 	}

// 	async delete(id: string): Promise<void> {
// 		await this.ensureInit();
// 		await this.db.exec(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
// 	}

// 	async query<TQuery = Record<string, unknown>>(
// 		sql: string,
// 		params: readonly unknown[] = [],
// 	): Promise<TQuery[]> {
// 		await this.ensureInit();
// 		return this.db.query<TQuery>(sql, params);
// 	}
// }
