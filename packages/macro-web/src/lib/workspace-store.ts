import type {
	EditorOperation,
	EditorOperationResult,
	FileTreeItemDto,
	HostError,
	HostEvent,
	SettingsApplyResult,
	SettingsUiSnapshotDto,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { useSyncExternalStore } from "react";
import {
	type HostClient,
	HostRequestError,
	type TransportState,
} from "./host-client";
import {
	loadUserPreferences,
	saveUserPreferences,
} from "./user-preferences-storage";

export interface BrowserWorkspaceState {
	readonly status: TransportState | "loading";
	readonly snapshot?: WorkspaceSnapshot;
	readonly settingsSnapshot?: SettingsUiSnapshotDto;
	readonly settingsRevision?: string;
	readonly lastSequence: number;
	readonly lastRevision: number;
	readonly lastProjectRevision?: string;
	readonly protocolError?: HostError;
	readonly transportError?: string;
	readonly editorDrafts: Readonly<Record<string, readonly string[]>>;
	readonly editorConflict?: {
		readonly documentId: string;
		readonly localLines: readonly string[];
		readonly result: EditorOperationResult;
	};
	readonly editorResult?: EditorOperationResult;
	readonly pendingEditorRequests: Readonly<Record<string, string>>;
	readonly editorError?: { readonly code?: string; readonly message: string };
	readonly projectFileTree: readonly FileTreeItemDto[];
}

const initialState: BrowserWorkspaceState = {
	status: "loading",
	lastSequence: 0,
	lastRevision: 0,
	editorDrafts: {},
	pendingEditorRequests: {},
	projectFileTree: [],
};

export class BrowserWorkspaceStore {
	private state: BrowserWorkspaceState = initialState;
	private readonly listeners = new Set<() => void>();
	private stopEvent?: () => void;
	private stopTransport?: () => void;
	private startPromise?: Promise<void>;

	constructor(private readonly client: HostClient) {}

	getSnapshot = (): BrowserWorkspaceState => this.state;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		this.stopEvent = this.client.subscribe((event) => this.applyEvent(event));
		this.stopTransport = this.client.subscribeState((status) => {
			this.update({ status });
		});
		this.startPromise = this.client
			.createSession()
			.then(async (snapshot) => {
				if (
					this.client.getFileTree &&
					snapshot.project &&
					!snapshot.project.ephemeral
				)
					this.update({ projectFileTree: await this.client.getFileTree() });
				const prefs = loadUserPreferences();
				if (prefs.keymapProfile && prefs.keymapProfile !== "default") {
					try {
						const updated = await this.client.selectKeymap(prefs.keymapProfile);
						this.installSnapshot(updated);
						return;
					} catch (e) {
						console.warn("Could not apply persisted keymap profile:", e);
					}
				}
				this.installSnapshot(snapshot);
			})
			.catch((error: unknown) => {
				this.update({
					status: "error",
					protocolError:
						error instanceof HostRequestError ? error.error : undefined,
					transportError:
						error instanceof Error ? error.message : String(error),
				});
				throw error;
			});
		return this.startPromise;
	}

	async refresh(): Promise<void> {
		this.update({ status: "reconnecting" });
		const snapshot = await this.client.getSnapshot();
		await this.reassertUserPreferences(snapshot);
	}

	async executeCommand(
		command: string,
		args: readonly unknown[] = [],
	): Promise<unknown> {
		const result = await this.client.executeCommand(
			command,
			args,
			this.state.lastRevision,
		);
		const snapshot = this.client.getCachedSnapshot?.();
		if (snapshot) this.applyResponse(snapshot);
		return result;
	}

	async selectKeymap(profileId: string): Promise<void> {
		saveUserPreferences({ keymapProfile: profileId });
		const snapshot = await this.client.selectKeymap(profileId);
		this.installSnapshot(snapshot);
	}

	async openProject(path: string): Promise<void> {
		const snapshot = await this.client.openProject(path);
		await this.reassertUserPreferences(snapshot);
		await this.refreshFileTree();
	}

	async initProject(path: string, displayName?: string): Promise<void> {
		const snapshot = await this.client.initProject(path, displayName);
		await this.reassertUserPreferences(snapshot);
		await this.refreshFileTree();
	}

	async saveAsProject(path: string, displayName?: string): Promise<void> {
		const snapshot = await this.client.saveAsProject(path, displayName);
		await this.reassertUserPreferences(snapshot);
		await this.refreshFileTree();
	}

	async closeProject(): Promise<void> {
		const snapshot = await this.client.closeProject();
		await this.reassertUserPreferences(snapshot);
		this.update({ projectFileTree: [] });
	}

	async refreshFileTree(): Promise<void> {
		const project = this.state.snapshot?.project;
		if (!this.client.getFileTree || !project || project.ephemeral) return;
		this.update({ projectFileTree: await this.client.getFileTree() });
	}

	private async reassertUserPreferences(
		snapshot: WorkspaceSnapshot,
	): Promise<void> {
		const prefs = loadUserPreferences();
		if (prefs.keymapProfile && prefs.keymapProfile !== "default") {
			try {
				const updated = await this.client.selectKeymap(prefs.keymapProfile);
				this.installSnapshot(updated);
				return;
			} catch (e) {
				console.warn("Could not reassert keymap profile:", e);
			}
		}
		this.installSnapshot(snapshot);
	}

	async applySettings(
		operation: Parameters<HostClient["applySettings"]>[0],
	): Promise<SettingsApplyResult> {
		const result = await this.client.applySettings(operation);
		this.applySettingsResult(result);
		return result;
	}

	async applySettingsUi(
		operation: Parameters<HostClient["applySettingsUi"]>[0],
	): Promise<SettingsApplyResult> {
		const result = await this.client.applySettingsUi(operation);
		this.applySettingsResult(result);
		return result;
	}

	setEditorDraft(documentId: string, lines: readonly string[]): void {
		this.update({
			editorDrafts: { ...this.state.editorDrafts, [documentId]: [...lines] },
		});
	}

	async applyEditorOperation(
		operation: EditorOperation,
	): Promise<EditorOperationResult> {
		const requestKey =
			"documentId" in operation && operation.documentId
				? operation.documentId
				: operation.operation;
		this.update({
			pendingEditorRequests: {
				...this.state.pendingEditorRequests,
				[requestKey]: operation.requestId,
			},
			editorError: undefined,
		});
		try {
			const result = await this.applyEditorOperationResult(operation);
			this.update({
				editorError:
					result.status === "rejected"
						? { code: result.code, message: result.message ?? "" }
						: undefined,
			});
			return result;
		} catch (error) {
			this.update({
				editorError: {
					code:
						error instanceof HostRequestError ? error.error.code : undefined,
					message: error instanceof Error ? error.message : String(error),
				},
			});
			throw error;
		} finally {
			if (
				this.state.pendingEditorRequests[requestKey] === operation.requestId
			) {
				const pending = { ...this.state.pendingEditorRequests };
				delete pending[requestKey];
				this.update({ pendingEditorRequests: pending });
			}
		}
	}

	private async applyEditorOperationResult(
		operation: EditorOperation,
	): Promise<EditorOperationResult> {
		const result = await this.client.applyEditorOperation(operation);
		const workspaceSnapshot = result.workspaceSnapshot;
		const currentDocument =
			"documentId" in operation
				? this.state.snapshot?.editor.documents.find(
						(document) => document.documentId === operation.documentId,
					)
				: undefined;
		const staleWorkspaceResult = Boolean(
			workspaceSnapshot && workspaceSnapshot.revision < this.state.lastRevision,
		);
		const staleDocumentResult = Boolean(
			currentDocument &&
				result.textRevision !== undefined &&
				result.textRevision < currentDocument.textRevision,
		);
		if (workspaceSnapshot && !staleWorkspaceResult)
			this.applyResponse(workspaceSnapshot);
		if (!staleWorkspaceResult && !staleDocumentResult)
			this.update({ editorResult: result });
		const isDocumentContentConflict =
			result.status === "conflict" &&
			(result.code === "EDITOR_EXTERNAL_CHANGE" ||
				result.code === "EDITOR_REVISION_STALE");

		if (
			isDocumentContentConflict &&
			"documentId" in operation &&
			typeof operation.documentId === "string"
		) {
			const activeDocument =
				this.state.snapshot?.editor.activeDocument?.documentId ===
				operation.documentId
					? this.state.snapshot.editor.activeDocument
					: undefined;
			const localLines = this.state.editorDrafts[operation.documentId];
			const diskLines = activeDocument?.lines.map((l) => l.rawText) ?? [];
			if (localLines && !linesEqual(localLines, diskLines)) {
				this.update({
					editorConflict: {
						documentId: operation.documentId,
						localLines,
						result,
					},
				});
			} else {
				const drafts = { ...this.state.editorDrafts };
				delete drafts[operation.documentId];
				this.update({ editorDrafts: drafts, editorConflict: undefined });
			}
		} else if (
			result.status === "accepted" &&
			operation.operation === "editor.replaceText" &&
			"documentId" in operation &&
			linesEqual(this.state.editorDrafts[operation.documentId], operation.lines)
		) {
			const drafts = { ...this.state.editorDrafts };
			delete drafts[operation.documentId];
			this.update({ editorDrafts: drafts, editorConflict: undefined });
		}
		return result;
	}

	async reloadEditorConflict(): Promise<void> {
		const conflict = this.state.editorConflict;
		if (!conflict) return;
		const path = conflict.result.path;
		if (path) {
			await this.applyEditorOperation({
				operation: "editor.openFile",
				requestId: crypto.randomUUID(),
				path,
			});
		}
		const drafts = { ...this.state.editorDrafts };
		delete drafts[conflict.documentId];
		this.update({ editorDrafts: drafts, editorConflict: undefined });
	}

	copyLocalDraft(documentId: string): readonly string[] | undefined {
		return this.state.editorDrafts[documentId];
	}

	async overwriteEditorConflict(): Promise<EditorOperationResult | undefined> {
		const conflict = this.state.editorConflict;
		const document = this.state.snapshot?.editor.documents.find(
			(item) => item.documentId === conflict?.documentId,
		);
		if (!conflict || !document) return undefined;
		return this.applyEditorOperation({
			operation: "editor.save",
			requestId: crypto.randomUUID(),
			documentId: conflict.documentId,
			expectedTextRevision: document.textRevision,
			force: true,
		});
	}

	dispose(): void {
		this.stopEvent?.();
		this.stopTransport?.();
		this.stopEvent = undefined;
		this.stopTransport = undefined;
		this.startPromise = undefined;
		this.client.dispose?.();
	}

	private installSnapshot(snapshot: WorkspaceSnapshot): void {
		this.update({
			status: "connected",
			snapshot,
			settingsSnapshot: snapshot.settings as SettingsUiSnapshotDto | undefined,
			settingsRevision: snapshot.settings?.settingsRevision,
			lastSequence: 0,
			lastRevision: snapshot.revision,
			lastProjectRevision: snapshot.project?.revision,
			transportError: undefined,
			...(snapshot.project?.ephemeral ? { projectFileTree: [] } : {}),
		});
	}

	private applyResponse(snapshot: WorkspaceSnapshot): void {
		if (snapshot.revision < this.state.lastRevision) return;
		this.update({
			status: "connected",
			snapshot,
			settingsSnapshot: snapshot.settings as SettingsUiSnapshotDto | undefined,
			settingsRevision: snapshot.settings?.settingsRevision,
			lastRevision: snapshot.revision,
			lastProjectRevision: snapshot.project?.revision,
			transportError: undefined,
		});
	}

	private applyEvent(event: HostEvent): void {
		if (event.sessionId !== this.client.getSessionId()) return;
		const snapshot = (event.payload as { snapshot?: WorkspaceSnapshot })
			.snapshot;
		const result = (
			event.payload as {
				result?: EditorOperationResult;
			}
		).result;
		if (!snapshot) return;
		if (snapshot.revision < this.state.lastRevision) return;
		if (event.sequence !== 0 && event.sequence <= this.state.lastSequence)
			return;

		// Events carry complete snapshots. If a sequence gap occurs, the snapshot
		// is a safe resynchronization point; there is no browser patch log to replay.
		this.update({
			status: "connected",
			snapshot,
			settingsSnapshot: snapshot.settings as SettingsUiSnapshotDto | undefined,
			settingsRevision: snapshot.settings?.settingsRevision,
			lastSequence: event.sequence,
			lastRevision: snapshot.revision,
			lastProjectRevision: snapshot.project?.revision,
			transportError: undefined,
		});
		const tree = (event.payload as { tree?: readonly FileTreeItemDto[] }).tree;
		if (event.type === "project.fileTree.changed" && tree)
			this.update({ projectFileTree: tree });
		if (result && result.workspaceRevision >= this.state.lastRevision)
			this.update({
				editorResult: result,
				editorError:
					result.status === "rejected"
						? { code: result.code, message: result.message ?? "" }
						: undefined,
			});
		if (result?.status === "conflict" && result.documentId) {
			const localLines = this.state.editorDrafts[result.documentId];
			if (localLines !== undefined)
				this.update({
					editorConflict: { documentId: result.documentId, localLines, result },
				});
		}
	}

	private applySettingsResult(result: SettingsApplyResult): void {
		if (
			result.status === "conflict" ||
			result.status === "blocked" ||
			result.status === "unsupported" ||
			result.status === "preview"
		) {
			// Preserve the browser draft on validation/conflict errors. The
			// returned snapshot reflects host-authoritative state, but the
			// caller keeps its local draft edits.
			this.update({
				settingsSnapshot: result.snapshot,
				settingsRevision: result.snapshot.settingsRevision,
			});
			return;
		}
		this.update({
			settingsSnapshot: result.snapshot,
			settingsRevision: result.settingsRevision,
		});
	}

	private update(next: Partial<BrowserWorkspaceState>): void {
		this.state = { ...this.state, ...next };
		for (const listener of this.listeners) listener();
	}
}

function linesEqual(
	left: readonly string[] | undefined,
	right: readonly string[],
): boolean {
	return (
		left !== undefined &&
		left.length === right.length &&
		left.every((line, index) => line === right[index])
	);
}

export function useBrowserWorkspaceStore(
	store: BrowserWorkspaceStore,
): BrowserWorkspaceState {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}
