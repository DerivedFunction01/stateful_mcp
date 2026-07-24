import type { EntityStore, SqlQueryStore } from "./interfaces";
import type { OpfsWorkerBridge } from "./opfs-repo";

export class OpfsEntityStore<T> implements EntityStore<T>, SqlQueryStore {
	private map = new Map<string, T>();

	constructor(
		private bridge: OpfsWorkerBridge,
		private tableName: string,
	) {
		this.bridge.init().catch(() => {});
	}

	private scoped(id: string): string {
		return `${this.tableName}:${id}`;
	}

	async get(id: string): Promise<T | null> {
		const key = this.scoped(id);
		const local = this.map.get(key);
		const remote = await this.bridge.request<{ data: string } | null>("get", {
			tableName: this.tableName,
			id,
		});
		if (remote && remote.data) {
			const parsed = JSON.parse(remote.data) as T;
			this.map.set(key, parsed);
			return parsed;
		}
		return local ?? null;
	}

	async set(id: string, entity: T): Promise<void> {
		const key = this.scoped(id);
		this.map.set(key, entity);
		await this.bridge.request("set", {
			tableName: this.tableName,
			id,
			data: JSON.stringify(entity),
		});
	}

	async list(): Promise<T[]> {
		const remote = await this.bridge.request<{ data: string }[] | null>(
			"list",
			{
				tableName: this.tableName,
			},
		);
		if (remote && remote.length > 0) {
			return remote.map((r) => JSON.parse(r.data) as T);
		}
		return Array.from(this.map.values());
	}

	async delete(id: string): Promise<void> {
		this.map.delete(this.scoped(id));
		await this.bridge.request("delete", {
			tableName: this.tableName,
			id,
		});
	}

	async query<TQuery = Record<string, unknown>>(
		sql: string,
		params: readonly unknown[] = [],
	): Promise<TQuery[]> {
		return this.bridge.query<TQuery>(sql, params);
	}
}
