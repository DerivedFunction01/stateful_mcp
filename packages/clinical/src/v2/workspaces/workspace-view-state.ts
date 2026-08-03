import { WorkspaceService } from "./workspace-service";

export interface WorkspaceViewState {
	userId: string;
	workspaceId: string;
	focusedBranchId: string | null;
	selectedHead?: string;
}

export interface WorkspaceViewStateStore {
	get(userId: string, workspaceId: string): Promise<WorkspaceViewState | null>;
	save(state: WorkspaceViewState): Promise<void>;
}

export class InMemoryWorkspaceViewStateStore implements WorkspaceViewStateStore {
	private readonly states = new Map<string, WorkspaceViewState>();

	async get(userId: string, workspaceId: string): Promise<WorkspaceViewState | null> {
		return this.states.get(`${userId}:${workspaceId}`) ?? null;
	}

	async save(state: WorkspaceViewState): Promise<void> {
		this.states.set(`${state.userId}:${state.workspaceId}`, state);
	}
}

export class WorkspaceViewService {
	constructor(
		private readonly workspace: WorkspaceService,
		private readonly store: WorkspaceViewStateStore,
	) {}

	async focusBranch(userId: string, workspaceId: string, branchRef: string): Promise<WorkspaceViewState> {
		const aggregate = await this.workspace.getWorkspace(workspaceId);
		if (!aggregate) throw new Error(`Workspace '${workspaceId}' was not found`);
		const branch = this.workspace.resolveBranchRef(aggregate, branchRef);
		const current = await this.store.get(userId, workspaceId);
		const state: WorkspaceViewState = {
			userId,
			workspaceId,
			focusedBranchId: branch.id,
			selectedHead: current?.selectedHead ?? aggregate.eventHead,
		};
		await this.store.save(state);
		return state;
	}

	async selectHead(userId: string, workspaceId: string, head: string): Promise<WorkspaceViewState> {
		const current = await this.store.get(userId, workspaceId);
		const state: WorkspaceViewState = {
			userId,
			workspaceId,
			focusedBranchId: current?.focusedBranchId ?? null,
			selectedHead: head,
		};
		await this.store.save(state);
		return state;
	}

	get(userId: string, workspaceId: string): Promise<WorkspaceViewState | null> {
		return this.store.get(userId, workspaceId);
	}
}
