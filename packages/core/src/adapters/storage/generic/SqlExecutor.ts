import type { SqlBackend, SqlStatement } from "../sql/backend";

export class SqlExecutor {
	constructor(private backend: SqlBackend) {}

	get compiler() {
		return this.backend.compiler;
	}

	async query(sql: string, params?: any[]): Promise<Record<string, any>[]> {
		return this.backend.query(sql, params);
	}

	async queryOne(
		sql: string,
		params?: any[],
	): Promise<Record<string, any> | null> {
		return this.backend.queryOne(sql, params);
	}

	async exec(sql: string, params?: any[]): Promise<void> {
		return this.backend.exec(sql, params);
	}

	async transaction(statements: SqlStatement[]): Promise<void> {
		return this.backend.transaction(statements);
	}
}
