import type { KvBackend } from "@stateful-mcp/core";
import { createWorkspace } from "./workspace-factory";
import type { WorkspaceStore } from "./workspace-store";
import type {
	CreateWorkspaceRequest,
	V2WorkspaceAggregate,
} from "./workspace-types";

export class KvWorkspaceStore implements WorkspaceStore {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:workspace:",
	) {}

	private key(workspaceId: string): string {
		return `${this.prefix}${workspaceId}`;
	}

	async init(request: CreateWorkspaceRequest): Promise<V2WorkspaceAggregate> {
		const aggregate = createWorkspace(request);
		await this.save(aggregate);
		return aggregate;
	}

	async get(workspaceId: string): Promise<V2WorkspaceAggregate | null> {
		const data = await this.backend.load();
		return this.read(data[this.key(workspaceId)]);
	}

	async list(sessionId: string): Promise<V2WorkspaceAggregate[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((value) => this.read(value))
			.filter((aggregate): aggregate is V2WorkspaceAggregate =>
				Boolean(aggregate),
			)
			.filter((aggregate) => aggregate.sessionId === sessionId)
			.sort((left, right) => left.id.localeCompare(right.id));
	}

	async save(aggregate: V2WorkspaceAggregate): Promise<void> {
		await this.backend.set(this.key(aggregate.id), JSON.stringify(aggregate));
		await this.backend.save();
	}

	private read(value: unknown): V2WorkspaceAggregate | null {
		if (typeof value !== "string") return null;
		try {
			return JSON.parse(value) as V2WorkspaceAggregate;
		} catch {
			return null;
		}
	}
}
