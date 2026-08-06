import type { KvBackend } from "@stateful-mcp/core";
import { createWorkspace } from "./workspace-factory";
import type { WorkspaceStore } from "./workspace-store";
import type {
	CreateWorkspaceRequest,
	WorkspaceAggregate,
} from "./workspace-types";

export class KvWorkspaceStore implements WorkspaceStore {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:workspace:",
	) {}

	private key(workspaceId: string): string {
		return `${this.prefix}${workspaceId}`;
	}

	async init(request: CreateWorkspaceRequest): Promise<WorkspaceAggregate> {
		const aggregate = createWorkspace(request);
		await this.save(aggregate);
		return aggregate;
	}

	async get(workspaceId: string): Promise<WorkspaceAggregate | null> {
		const data = await this.backend.load();
		return this.read(data[this.key(workspaceId)]);
	}

	async list(sessionId: string): Promise<WorkspaceAggregate[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((value) => this.read(value))
			.filter((aggregate): aggregate is WorkspaceAggregate =>
				Boolean(aggregate && typeof aggregate.id === "string"),
			)
			.filter((aggregate) => aggregate.sessionId === sessionId)
			.sort((left, right) => (left.id ?? "").localeCompare(right.id ?? ""));
	}

	async save(aggregate: WorkspaceAggregate): Promise<void> {
		await this.backend.set(this.key(aggregate.id), JSON.stringify(aggregate));
		await this.backend.save();
	}

	private read(value: unknown): WorkspaceAggregate | null {
		if (typeof value !== "string") return null;
		try {
			return JSON.parse(value) as WorkspaceAggregate;
		} catch {
			return null;
		}
	}
}
