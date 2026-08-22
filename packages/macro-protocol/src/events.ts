import type { EditorOperationResult } from "./editor";
import type { FileTreeItemDto, WorkspaceSnapshot } from "./workspace";

export type HostEventType =
	| "session.ready"
	| "workspace.changed"
	| "settings.changed"
	| "profile.changed"
	| "keymap.changed"
	| "contributions.changed"
	| "diagnostics.changed"
	| "editor.operation.completed"
	| "command.completed"
	| "project.fileTree.changed"
	| "session.disposed";

export interface FileTreeChangedEventPayload {
	readonly tree: readonly FileTreeItemDto[];
}

export interface SnapshotEventPayload {
	readonly snapshot: WorkspaceSnapshot;
	readonly result?: EditorOperationResult;
}

export interface EditorOperationEventPayload extends SnapshotEventPayload {
	readonly result: EditorOperationResult;
}
