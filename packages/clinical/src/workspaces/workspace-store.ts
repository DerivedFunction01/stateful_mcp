import type {
	CreateWorkspaceRequest,
	V2WorkspaceAggregate,
} from "./workspace-types";

export interface WorkspaceStore {
	init(request: CreateWorkspaceRequest): Promise<V2WorkspaceAggregate>;
	get(workspaceId: string): Promise<V2WorkspaceAggregate | null>;
	list(sessionId: string): Promise<V2WorkspaceAggregate[]>;
	save(aggregate: V2WorkspaceAggregate): Promise<void>;
}
