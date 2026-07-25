import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";

/**
 * OPFS SQLite transport, internal to the SqlBackend family.
 */
export class OpfsDb {
	private promiser: any = null;
	private dbId: any = null;
	private ready = false;
	private fallback = false;
	private sqlite: Database | null = null;

	constructor(
		private dbName: string = "stateful_mcp_opfs.sqlite3",
		private workerUrl?: string,
	) {}

	async open(): Promise<void> {
		if (typeof Worker === "undefined") {
			this.fallback = true;
			const dir = path.dirname(this.dbName);
			if (dir !== "." && !fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			this.sqlite = new Database(this.dbName);
			this.sqlite.run("PRAGMA journal_mode = WAL;");
			return;
		}
		try {
			const { sqlite3Worker1Promiser } = await import(
				"@sqlite.org/sqlite-wasm"
			);
			const workerScript =
				this.workerUrl ||
				new URL(
					"node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-worker1.mjs",
					import.meta.url,
				).href;
			const worker = new Worker(workerScript, { type: "module" });
			this.promiser = await sqlite3Worker1Promiser.v2({ worker });
			const result = await this.promiser("open", { filename: this.dbName });
			this.dbId = result.dbId;
			this.ready = true;
		} catch {
			this.fallback = true;
			const dir = path.dirname(this.dbName);
			if (dir !== "." && !fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			this.sqlite = new Database(this.dbName);
			this.sqlite.run("PRAGMA journal_mode = WAL;");
		}
	}

	async exec(
		sql: string,
		params?: readonly unknown[],
	): Promise<{ changes?: number; lastInsertRowId?: bigint }> {
		if (this.sqlite) {
			const result = (
				params ? this.sqlite.run(sql, params as any) : this.sqlite.run(sql)
			) as any;
			return {
				changes: result.changes,
				lastInsertRowId: result.lastInsertRowid,
			};
		}
		if (!this.ready) await this.open();
		if (this.promiser) {
			const result = await this.promiser("exec", {
				sql,
				bind: params as any,
				rowMode: "object" as const,
				returnValue: "resultRows" as const,
			});
			return {
				changes: (result as any).changeCount as number,
				lastInsertRowId: (result as any).lastInsertRowId as bigint | undefined,
			};
		}
		return {};
	}

	async query<T = Record<string, any>>(
		sql: string,
		params?: readonly unknown[],
	): Promise<T[]> {
		if (this.sqlite) {
			try {
				return (
					params
						? this.sqlite.query(sql).all(...(params as any[]))
						: this.sqlite.query(sql).all()
				) as T[];
			} catch {
				if (params) this.sqlite.run(sql, params as any);
				else this.sqlite.run(sql);
				return [];
			}
		}
		if (!this.ready) await this.open();
		if (this.promiser) {
			const result = await this.promiser("exec", {
				sql,
				bind: params as any,
				rowMode: "object" as const,
				returnValue: "resultRows" as const,
			});
			return ((result as any).resultRows || []) as T[];
		}
		return [];
	}

	async get<T = Record<string, any>>(
		sql: string,
		params?: readonly unknown[],
	): Promise<T | null> {
		if (this.sqlite) {
			const row = params
				? this.sqlite.query(sql).get(...(params as any[]))
				: this.sqlite.query(sql).get();
			return (row ?? null) as T | null;
		}
		const rows = await this.query<T>(sql, params);
		return rows.length > 0 ? (rows[0] ?? null) : null;
	}

	async close(): Promise<void> {
		if (this.promiser) {
			await this.promiser("close", {});
		}
		this.sqlite?.close();
	}

	isFallback(): boolean {
		return this.fallback;
	}
}
