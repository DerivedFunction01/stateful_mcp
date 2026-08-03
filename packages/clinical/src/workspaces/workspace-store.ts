import type {
	CreateWorkspaceRequest,
	WorkspaceAggregate,
} from "./workspace-types";

export interface WorkspaceStore {
	init(request: CreateWorkspaceRequest): Promise<WorkspaceAggregate>;
	get(workspaceId: string): Promise<WorkspaceAggregate | null>;
	list(sessionId: string): Promise<WorkspaceAggregate[]>;
	save(aggregate: WorkspaceAggregate): Promise<void>;
}
