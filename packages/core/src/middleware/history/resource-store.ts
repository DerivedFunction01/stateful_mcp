import type { KvBackend } from "../../adapters/storage/generic/kv/KvBackend";
import { SqlExecutor } from "../../adapters/storage/generic/SqlExecutor";
import type {
	HistoryResource,
	HistoryResourceStore,
} from "./contracts";

const RESOURCE_PREFIX = "__stateful_history_resource__:";

export class KvHistoryResourceStore<TPayload = unknown>
	implements HistoryResourceStore<TPayload>
{
	private data: Record<string, unknown> | null = null;
	constructor(private readonly backend: KvBackend) {}

	private async loaded(): Promise<Record<string, unknown>> {
		if (this.data === null) this.data = await this.backend.load();
		return this.data;
	}

	async create(
		historyId: string,
		metadata: Record<string, unknown> = {},
	): Promise<HistoryResource<TPayload>> {
		const resource = emptyResource<TPayload>(historyId, metadata);
		await this.save(resource);
		return resource;
	}

	async open(historyId: string): Promise<HistoryResource<TPayload> | null> {
		const data = await this.loaded();
		const value = data[`${RESOURCE_PREFIX}${historyId}`];
		return value ? structuredClone(value as HistoryResource<TPayload>) : null;
	}

	async save(resource: HistoryResource<TPayload>): Promise<void> {
		const data = await this.loaded();
		const value = structuredClone({
			...resource,
			updatedAt: new Date().toISOString(),
		});
		data[`${RESOURCE_PREFIX}${resource.historyId}`] = value;
		await this.backend.set(`${RESOURCE_PREFIX}${resource.historyId}`, value);
		await this.backend.save();
	}

	async list(): Promise<
		Array<
			Pick<
				HistoryResource<TPayload>,
				"historyId" | "formatVersion" | "createdAt" | "updatedAt" | "metadata"
			>
		>
	> {
		const data = await this.loaded();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(RESOURCE_PREFIX))
			.map(([, value]) => {
				const resource = value as HistoryResource<TPayload>;
				return {
					historyId: resource.historyId,
					formatVersion: resource.formatVersion,
					createdAt: resource.createdAt,
					updatedAt: resource.updatedAt,
					metadata: structuredClone(resource.metadata),
				};
			});
	}

	async delete(historyId: string): Promise<void> {
		const data = await this.loaded();
		delete data[`${RESOURCE_PREFIX}${historyId}`];
		await this.backend.delete(`${RESOURCE_PREFIX}${historyId}`);
		await this.backend.save();
	}
}

export class SqlHistoryResourceStore<TPayload = unknown>
	implements HistoryResourceStore<TPayload>
{
	private readonly ready: Promise<void>;

	constructor(
		private readonly executor: SqlExecutor,
		private readonly table = "history_resources",
	) {
		assertIdentifier(table);
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const query = this.executor.compiler.compileCreateTable({
			table: this.table,
			columns: [
				{ name: "history_id", type: "id", primaryKey: true },
				{ name: "format_version", type: "int", nullable: false },
				{ name: "created_at", type: "timestamp", nullable: false },
				{ name: "updated_at", type: "timestamp", nullable: false },
				{ name: "metadata", type: "json", nullable: false },
				{ name: "events", type: "json", nullable: false },
			],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async create(
		historyId: string,
		metadata: Record<string, unknown> = {},
	): Promise<HistoryResource<TPayload>> {
		const resource = emptyResource<TPayload>(historyId, metadata);
		await this.save(resource);
		return resource;
	}

	async open(historyId: string): Promise<HistoryResource<TPayload> | null> {
		await this.ready;
		const query = this.executor.compiler.compileSelect({
			table: this.table,
			where: [{ column: "history_id", op: "eq", value: historyId }],
			limit: 1,
		});
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? decodeResource<TPayload>(row) : null;
	}

	async save(resource: HistoryResource<TPayload>): Promise<void> {
		await this.ready;
		const updatedAt = new Date().toISOString();
		const query = this.executor.compiler.compileReplace({
			table: this.table,
			values: {
				history_id: resource.historyId,
				format_version: resource.formatVersion,
				created_at: resource.createdAt,
				updated_at: updatedAt,
				metadata: JSON.stringify(resource.metadata),
				events: JSON.stringify(resource.events),
			},
			conflictColumns: ["history_id"],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async list(): Promise<
		Array<
			Pick<
				HistoryResource<TPayload>,
				"historyId" | "formatVersion" | "createdAt" | "updatedAt" | "metadata"
			>
		>
	> {
		await this.ready;
		const query = this.executor.compiler.compileSelect({
			table: this.table,
			orderBy: [{ column: "updated_at", direction: "DESC" }],
		});
		const rows = await this.executor.query(query.sql, query.params);
		return rows.map((row) => {
			const resource = decodeResource<TPayload>(row);
			return {
				historyId: resource.historyId,
				formatVersion: resource.formatVersion,
				createdAt: resource.createdAt,
				updatedAt: resource.updatedAt,
				metadata: resource.metadata,
			};
		});
	}

	async delete(historyId: string): Promise<void> {
		await this.ready;
		const query = this.executor.compiler.compileDelete({
			table: this.table,
			where: [{ column: "history_id", op: "eq", value: historyId }],
		});
		await this.executor.exec(query.sql, query.params);
	}
}

function emptyResource<TPayload>(
	historyId: string,
	metadata: Record<string, unknown>,
): HistoryResource<TPayload> {
	const now = new Date().toISOString();
	return {
		historyId,
		formatVersion: 1,
		createdAt: now,
		updatedAt: now,
		metadata: structuredClone(metadata),
		events: [],
	};
}

function decodeResource<TPayload>(row: Record<string, any>): HistoryResource<TPayload> {
	return {
		historyId: String(row.history_id),
		formatVersion: Number(row.format_version),
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at),
		metadata: parseJsonValue(row.metadata) as Record<string, unknown>,
		events: parseJsonValue(row.events) as HistoryResource<TPayload>["events"],
	};
}

function parseJsonValue(value: unknown): unknown {
	if (typeof value !== "string") return structuredClone(value);
	return JSON.parse(value);
}

function assertIdentifier(value: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
		throw new Error(`Invalid history resource table identifier '${value}'`);
}
