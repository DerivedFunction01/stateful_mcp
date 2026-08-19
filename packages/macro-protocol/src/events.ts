import type { WorkspaceSnapshot } from "./workspace";

export type HostEventType =
	| "session.ready"
	| "workspace.changed"
	| "settings.changed"
	| "profile.changed"
	| "keymap.changed"
	| "contributions.changed"
	| "diagnostics.changed"
	| "parse.completed"
	| "command.completed"
	| "session.disposed";

export interface SnapshotEventPayload {
	readonly snapshot: WorkspaceSnapshot;
}
export interface ParseRequestPayload {
	readonly text: string;
	readonly textRevision: number;
}
export interface ParseResultPayload {
	readonly textRevision: number;
	readonly lines: readonly Readonly<Record<string, unknown>>[];
}
