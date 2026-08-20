import type { EditorOperationResult } from "./editor";
import type { WorkspaceSnapshot } from "./workspace";

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
	| "session.disposed";

export interface SnapshotEventPayload {
	readonly snapshot: WorkspaceSnapshot;
	readonly result?: EditorOperationResult;
}

export interface EditorOperationEventPayload extends SnapshotEventPayload {
	readonly result: EditorOperationResult;
}
