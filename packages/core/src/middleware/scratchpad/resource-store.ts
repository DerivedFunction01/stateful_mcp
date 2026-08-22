import type { KvBackend } from "../../adapters/storage/generic/kv/KvBackend";
import type { SqlExecutor } from "../../adapters/storage/generic/SqlExecutor";
import type {
	ScratchpadCell,
	ScratchpadResource,
	ScratchpadResourceStore,
} from "./contracts";

const SCRATCHPAD_RESOURCE_PREFIX = "__stateful_scratchpad_resource__:";

export class KvScratchpadResourceStore implements ScratchpadResourceStore {
	private data: Record<string, unknown> | null = null;
	constructor(private readonly backend: KvBackend) {}

	private async loaded(): Promise<Record<string, unknown>> {
		if (this.data === null) this.data = await this.backend.load();
		return this.data;
	}

	async create(
		scratchpadId: string,
		title = "scratchpad",
		initialText = "",
		metadata: Record<string, unknown> = {},
	): Promise<ScratchpadResource> {
		const resource = emptyScratchpadResource(
			scratchpadId,
			title,
			initialText,
			metadata,
		);
		await this.save(resource);
		return resource;
	}

	async open(scratchpadId: string): Promise<ScratchpadResource | null> {
		const data = await this.loaded();
		const value = data[`${SCRATCHPAD_RESOURCE_PREFIX}${scratchpadId}`];
		return value ? structuredClone(value as ScratchpadResource) : null;
	}

	async save(resource: ScratchpadResource): Promise<void> {
		const data = await this.loaded();
		const value = structuredClone({
			...resource,
			updatedAt: new Date().toISOString(),
		});
		data[`${SCRATCHPAD_RESOURCE_PREFIX}${resource.scratchpadId}`] = value;
		await this.backend.set(
			`${SCRATCHPAD_RESOURCE_PREFIX}${resource.scratchpadId}`,
			value,
		);
		await this.backend.save();
	}

	async list(): Promise<
		Array<
			Pick<
				ScratchpadResource,
				| "scratchpadId"
				| "formatVersion"
				| "title"
				| "createdAt"
				| "updatedAt"
				| "textRevision"
				| "metadata"
			>
		>
	> {
		const data = await this.loaded();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(SCRATCHPAD_RESOURCE_PREFIX))
			.map(([, value]) => {
				const resource = value as ScratchpadResource;
				return {
					scratchpadId: resource.scratchpadId,
					formatVersion: resource.formatVersion,
					title: resource.title,
					createdAt: resource.createdAt,
					updatedAt: resource.updatedAt,
					textRevision: resource.textRevision,
					metadata: structuredClone(resource.metadata),
				};
			})
			.sort(
				(a, b) =>
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			);
	}

	async delete(scratchpadId: string): Promise<void> {
		const data = await this.loaded();
		delete data[`${SCRATCHPAD_RESOURCE_PREFIX}${scratchpadId}`];
		await this.backend.delete(`${SCRATCHPAD_RESOURCE_PREFIX}${scratchpadId}`);
		await this.backend.save();
	}
}

export class SqlScratchpadResourceStore implements ScratchpadResourceStore {
	private readonly ready: Promise<void>;

	constructor(
		private readonly executor: SqlExecutor,
		private readonly table = "scratchpad_resources",
	) {
		assertIdentifier(table);
		this.ready = this.ensureTable();
	}

	private async ensureTable(): Promise<void> {
		const query = this.executor.compiler.compileCreateTable({
			table: this.table,
			columns: [
				{ name: "scratchpad_id", type: "id", primaryKey: true },
				{ name: "format_version", type: "int", nullable: false },
				{ name: "title", type: "text", nullable: false },
				{ name: "created_at", type: "timestamp", nullable: false },
				{ name: "updated_at", type: "timestamp", nullable: false },
				{ name: "text_revision", type: "int", nullable: false },
				{ name: "raw_text", type: "text", nullable: false },
				{ name: "lines", type: "json", nullable: false },
				{ name: "executed_line_indices", type: "json", nullable: false },
				{ name: "pinned_macro_ids", type: "json", nullable: false },
				{ name: "metadata", type: "json", nullable: false },
			],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async create(
		scratchpadId: string,
		title = "scratchpad",
		initialText = "",
		metadata: Record<string, unknown> = {},
	): Promise<ScratchpadResource> {
		const resource = emptyScratchpadResource(
			scratchpadId,
			title,
			initialText,
			metadata,
		);
		await this.save(resource);
		return resource;
	}

	async open(scratchpadId: string): Promise<ScratchpadResource | null> {
		await this.ready;
		const query = this.executor.compiler.compileSelect({
			table: this.table,
			where: [{ column: "scratchpad_id", op: "eq", value: scratchpadId }],
			limit: 1,
		});
		const row = await this.executor.queryOne(query.sql, query.params);
		return row ? decodeScratchpadResource(row) : null;
	}

	async save(resource: ScratchpadResource): Promise<void> {
		await this.ready;
		const updatedAt = new Date().toISOString();
		const query = this.executor.compiler.compileReplace({
			table: this.table,
			values: {
				scratchpad_id: resource.scratchpadId,
				format_version: resource.formatVersion,
				title: resource.title,
				created_at: resource.createdAt,
				updated_at: updatedAt,
				text_revision: resource.textRevision,
				raw_text: resource.rawText,
				lines: JSON.stringify(resource.lines),
				executed_line_indices: JSON.stringify(resource.executedLineIndices),
				pinned_macro_ids: JSON.stringify(resource.pinnedMacroIds),
				metadata: JSON.stringify(resource.metadata),
			},
			conflictColumns: ["scratchpad_id"],
		});
		await this.executor.exec(query.sql, query.params);
	}

	async list(): Promise<
		Array<
			Pick<
				ScratchpadResource,
				| "scratchpadId"
				| "formatVersion"
				| "title"
				| "createdAt"
				| "updatedAt"
				| "textRevision"
				| "metadata"
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
			const resource = decodeScratchpadResource(row);
			return {
				scratchpadId: resource.scratchpadId,
				formatVersion: resource.formatVersion,
				title: resource.title,
				createdAt: resource.createdAt,
				updatedAt: resource.updatedAt,
				textRevision: resource.textRevision,
				metadata: resource.metadata,
			};
		});
	}

	async delete(scratchpadId: string): Promise<void> {
		await this.ready;
		const query = this.executor.compiler.compileDelete({
			table: this.table,
			where: [{ column: "scratchpad_id", op: "eq", value: scratchpadId }],
		});
		await this.executor.exec(query.sql, query.params);
	}
}

function emptyScratchpadResource(
	scratchpadId: string,
	title: string,
	initialText: string,
	metadata: Record<string, unknown>,
): ScratchpadResource {
	const now = new Date().toISOString();
	const lines: ScratchpadCell[] = initialText
		? initialText.split("\n").map((rawText, idx) => ({
				lineNumber: idx + 1,
				rawText,
			}))
		: [];
	return {
		scratchpadId,
		formatVersion: 1,
		title,
		createdAt: now,
		updatedAt: now,
		textRevision: 0,
		rawText: initialText,
		lines,
		executedLineIndices: [],
		pinnedMacroIds: [],
		metadata: structuredClone(metadata),
	};
}

function decodeScratchpadResource(
	row: Record<string, any>,
): ScratchpadResource {
	return {
		scratchpadId: String(row.scratchpad_id),
		formatVersion: Number(row.format_version),
		title: String(row.title ?? "scratchpad"),
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at),
		textRevision: Number(row.text_revision ?? 0),
		rawText: String(row.raw_text ?? ""),
		lines: parseJsonValue(row.lines) as ScratchpadCell[],
		executedLineIndices: parseJsonValue(row.executed_line_indices) as number[],
		pinnedMacroIds: parseJsonValue(row.pinned_macro_ids) as string[],
		metadata: parseJsonValue(row.metadata) as Record<string, unknown>,
	};
}

function parseJsonValue(value: unknown): unknown {
	if (typeof value !== "string") return structuredClone(value);
	return JSON.parse(value);
}

function assertIdentifier(value: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
		throw new Error(`Invalid scratchpad resource table identifier '${value}'`);
}
