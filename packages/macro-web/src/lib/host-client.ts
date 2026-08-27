import {
	type EditorOperation,
	type EditorOperationResult,
	type FileTreeItemDto,
	type HostError,
	type HostRequest,
	type HostResponse,
	type KeymapBindingContextDto,
	type KeymapBindingResolutionDto,
	MACRO_PROTOCOL_VERSION,
	type ProjectConfigurationDto,
	type ProjectConfigurationEditDto,
	type ProjectExtensionGroupDraft,
	type ProjectExtensionGroupOperationResult,
	type ProjectExtensionGroupPatch,
	type ProjectMigrationJournalStatusDto,
	type ProjectMigrationRecoveryResultDto,
	type ProjectOperationResult,
	type SettingsApplyResult,
	type SettingsBundleOperation,
	type SettingsBundleResult,
	type SettingsOperation,
	type SettingsScope,
	type SettingsUiOperation,
	safeHostError,
	type UserPreferencesDto,
	type UserPreferencesExportBundleDto,
	type ValueAuthoringProfileDto,
	type ValueAuthoringResult,
	type ValueRequestDto,
	type ValueSampleDto,
	type HostEvent as WireHostEvent,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";

export type HostWorkspaceSnapshot = WorkspaceSnapshot;
export type HostEvent = WireHostEvent;
export type TransportState =
	| "idle"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "disconnected"
	| "error";

export class HostRequestError extends Error {
	constructor(readonly error: HostError) {
		super(error.code);
		this.name = "HostRequestError";
	}
}

export interface FsBrowseResult {
	readonly currentPath: string;
	readonly parentPath: string | null;
	readonly entries: readonly {
		readonly name: string;
		readonly isDirectory: boolean;
		readonly isMacroProject: boolean;
	}[];
}

export interface HostClient {
	createSession(options?: {
		readonly profileId?: string;
		readonly locale?: string;
		readonly initialText?: string;
	}): Promise<HostWorkspaceSnapshot>;
	getSnapshot(): Promise<HostWorkspaceSnapshot>;
	executeCommand(
		command: string,
		args?: readonly unknown[],
		expectedRevision?: number,
	): Promise<unknown>;
	selectKeymap(profileId: string): Promise<HostWorkspaceSnapshot>;
	resolveBinding(
		chord: string,
		context: KeymapBindingContextDto,
	): Promise<KeymapBindingResolutionDto>;
	applySettings(operation: SettingsOperation): Promise<SettingsApplyResult>;
	applySettingsUi(operation: SettingsUiOperation): Promise<SettingsApplyResult>;
	applySettingsBundle(
		operation: SettingsBundleOperation,
	): Promise<SettingsBundleResult>;
	valueAuthoringLoad(
		profileId: string,
		scope?: SettingsScope,
	): Promise<ValueAuthoringResult>;
	valueAuthoringValidate(
		profile: ValueAuthoringProfileDto,
	): Promise<ValueAuthoringResult>;
	valueAuthoringPreview(
		profile: ValueAuthoringProfileDto,
		options?: {
			readonly samples?: readonly ValueSampleDto[];
			readonly request?: ValueRequestDto;
			readonly expectedRevision?: string;
			readonly activeDomain?: string;
			readonly selectedGroupId?: string;
			readonly selectedRecipeId?: string;
		},
	): Promise<ValueAuthoringResult>;
	valueAuthoringSave(
		profile: ValueAuthoringProfileDto,
		expectedRevision: string,
	): Promise<ValueAuthoringResult>;
	applyEditorOperation(
		operation: EditorOperation,
	): Promise<EditorOperationResult>;
	browseFs(path?: string): Promise<FsBrowseResult>;
	createDirectory(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }>;
	createProjectDirectory?(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }>;
	getFileTree?(): Promise<readonly FileTreeItemDto[]>;
	createFile?(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }>;
	openProject(path: string): Promise<HostWorkspaceSnapshot>;
	initProject(
		path: string,
		displayName?: string,
	): Promise<HostWorkspaceSnapshot>;
	saveAsProject(
		path: string,
		displayName?: string,
	): Promise<HostWorkspaceSnapshot>;
	closeProject(): Promise<HostWorkspaceSnapshot>;
	getProjectConfiguration?(): Promise<ProjectConfigurationDto>;
	updateProjectConfiguration?(
		configuration: ProjectConfigurationEditDto,
		expectedRevision: string,
	): Promise<ProjectOperationResult>;
	previewExtensionGroup?(
		groupId?: string,
		extensionIds?: readonly string[],
		setActive?: boolean,
	): Promise<ProjectExtensionGroupOperationResult>;
	updateExtensionGroup?(
		patch: ProjectExtensionGroupPatch,
		expectedRevision: string,
		apply?: boolean,
	): Promise<ProjectExtensionGroupOperationResult>;
	createExtensionGroup?(
		group: ProjectExtensionGroupDraft,
		expectedRevision: string,
		apply?: boolean,
	): Promise<ProjectExtensionGroupOperationResult>;
	duplicateExtensionGroup?(
		sourceGroupId: string,
		expectedRevision: string,
		displayName?: string,
		groupId?: string,
		setActive?: boolean,
		apply?: boolean,
	): Promise<ProjectExtensionGroupOperationResult>;
	deleteExtensionGroup?(
		groupId: string,
		expectedRevision: string,
		replacementGroupId?: string,
		clearActive?: boolean,
		apply?: boolean,
	): Promise<ProjectExtensionGroupOperationResult>;
	setActiveExtensionGroup?(
		groupId: string | null,
		expectedRevision: string,
		apply?: boolean,
	): Promise<ProjectExtensionGroupOperationResult>;
	previewBackendMigration?(
		target: ProjectConfigurationDto["backend"],
	): Promise<ProjectOperationResult>;
	applyBackendMigration?(
		target: ProjectConfigurationDto["backend"],
		expectedRevision: string,
	): Promise<ProjectOperationResult>;
	getMigrationJournal?(): Promise<ProjectMigrationJournalStatusDto>;
	recoverBackendMigration?(): Promise<ProjectMigrationRecoveryResultDto>;
	discardBackendMigration?(): Promise<ProjectMigrationRecoveryResultDto>;
	resumeBackendMigration?(): Promise<ProjectOperationResult>;
	getUserPreferences?(): Promise<UserPreferencesDto>;
	setUserPreferences?(
		partial: Partial<UserPreferencesDto>,
	): Promise<UserPreferencesDto>;
	exportUserPreferences?(): Promise<UserPreferencesExportBundleDto>;
	importUserPreferences?(
		bundle: UserPreferencesExportBundleDto,
	): Promise<UserPreferencesDto>;
	subscribe(listener: (event: HostEvent) => void): () => void;
	subscribeState(listener: (state: TransportState) => void): () => void;
	getState(): TransportState;
	getSessionId(): string | undefined;
	getCachedSnapshot?(): HostWorkspaceSnapshot | undefined;
	dispose?(): void;
}

export class BrowserHostClient implements HostClient {
	private readonly listeners = new Set<(event: HostEvent) => void>();
	private readonly stateListeners = new Set<(state: TransportState) => void>();
	private socket?: WebSocket;
	private snapshot?: HostWorkspaceSnapshot;
	private sessionId?: string;
	private state: TransportState = "idle";
	private reconnectTimer?: number;

	constructor(private readonly baseUrl = "") {}

	getState(): TransportState {
		return this.state;
	}
	getSessionId(): string | undefined {
		return this.sessionId;
	}
	getCachedSnapshot(): HostWorkspaceSnapshot | undefined {
		return this.snapshot;
	}
	dispose(): void {
		if (this.reconnectTimer !== undefined)
			window.clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.socket?.close();
		this.socket = undefined;
		this.sessionId = undefined;
		this.snapshot = undefined;
		this.setState("disconnected");
	}

	async createSession(
		options: {
			readonly profileId?: string;
			readonly locale?: string;
			readonly initialText?: string;
		} = {},
	): Promise<HostWorkspaceSnapshot> {
		this.setState("connecting");
		const payload = await this.request<{
			sessionId: string;
			workspaceId: string;
			snapshot: HostWorkspaceSnapshot;
		}>("/api/sessions", {
			type: "session.open",
			sessionId: "",
			payload: options,
		});
		this.sessionId = payload.sessionId;
		this.snapshot = payload.snapshot;
		this.connectSocket();
		this.setState("connected");
		return payload.snapshot;
	}

	async getSnapshot(): Promise<HostWorkspaceSnapshot> {
		if (!this.sessionId) return this.createSession();
		const payload = await this.getRequest<HostWorkspaceSnapshot>(
			`/api/sessions/${encodeURIComponent(this.sessionId)}/snapshot`,
		);
		this.snapshot = payload;
		return payload;
	}

	async executeCommand(
		command: string,
		args: readonly unknown[] = [],
		expectedRevision?: number,
	): Promise<unknown> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			result?: unknown;
			snapshot?: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
			type: "command.execute",
			sessionId,
			payload: { command, args, expectedRevision },
		});
		if (payload.snapshot) this.snapshot = payload.snapshot;
		return payload.result;
	}

	async selectKeymap(profileId: string): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			snapshot?: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
			type: "keymap.profile.select",
			sessionId,
			payload: { profileId },
		});
		if (payload.snapshot) this.snapshot = payload.snapshot;
		return payload.snapshot ?? this.getSnapshot();
	}

	async resolveBinding(
		chord: string,
		context: KeymapBindingContextDto,
	): Promise<KeymapBindingResolutionDto> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			resolution?: KeymapBindingResolutionDto;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
			type: "keymap.binding.resolve",
			sessionId,
			payload: { chord, context },
		});
		return (
			payload.resolution ?? {
				chord,
				diagnostics: [],
			}
		);
	}

	async applySettings(
		operation: SettingsOperation,
	): Promise<SettingsApplyResult> {
		const sessionId = this.requireSession();
		const result = await this.request<SettingsApplyResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings`,
			{ type: "settings.apply", sessionId, payload: operation },
		);
		if (result.status === "saved" && result.snapshot)
			this.snapshot = result.snapshot as unknown as HostWorkspaceSnapshot;
		return result;
	}

	async applySettingsUi(
		operation: SettingsUiOperation,
	): Promise<SettingsApplyResult> {
		const sessionId = this.requireSession();
		const result = await this.request<SettingsApplyResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings.ui`,
			{ type: "settings.ui.apply", sessionId, payload: operation },
		);
		if (result.status === "saved" && result.snapshot)
			this.snapshot = result.snapshot as unknown as HostWorkspaceSnapshot;
		return result;
	}

	async applySettingsBundle(
		operation: SettingsBundleOperation,
	): Promise<SettingsBundleResult> {
		const sessionId = this.requireSession();
		return this.request<SettingsBundleResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings.bundle`,
			{ type: "settings.bundle", sessionId, payload: operation },
		);
	}

	async valueAuthoringLoad(
		profileId: string,
		scope?: SettingsScope,
	): Promise<ValueAuthoringResult> {
		const sessionId = this.requireSession();
		return this.request<ValueAuthoringResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings.valueAuthoring`,
			{
				type: "settings.valueAuthoring",
				sessionId,
				payload: { operation: "valueAuthoring.load", profileId, scope },
			},
		);
	}

	async valueAuthoringValidate(
		profile: ValueAuthoringProfileDto,
	): Promise<ValueAuthoringResult> {
		const sessionId = this.requireSession();
		return this.request<ValueAuthoringResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings.valueAuthoring`,
			{
				type: "settings.valueAuthoring",
				sessionId,
				payload: { operation: "valueAuthoring.validate", profile },
			},
		);
	}

	async valueAuthoringPreview(
		profile: ValueAuthoringProfileDto,
		options?: {
			readonly samples?: readonly ValueSampleDto[];
			readonly request?: ValueRequestDto;
			readonly expectedRevision?: string;
			readonly activeDomain?: string;
			readonly selectedGroupId?: string;
			readonly selectedRecipeId?: string;
		},
	): Promise<ValueAuthoringResult> {
		const sessionId = this.requireSession();
		return this.request<ValueAuthoringResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings.valueAuthoring`,
			{
				type: "settings.valueAuthoring",
				sessionId,
				payload: {
					operation: "valueAuthoring.preview",
					profile,
					samples: options?.samples,
					request: options?.request,
					expectedRevision: options?.expectedRevision,
					activeDomain: options?.activeDomain,
					selectedGroupId: options?.selectedGroupId,
					selectedRecipeId: options?.selectedRecipeId,
				},
			},
		);
	}

	async valueAuthoringSave(
		profile: ValueAuthoringProfileDto,
		expectedRevision: string,
	): Promise<ValueAuthoringResult> {
		const sessionId = this.requireSession();
		return this.request<ValueAuthoringResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/settings.valueAuthoring`,
			{
				type: "settings.valueAuthoring",
				sessionId,
				payload: {
					operation: "valueAuthoring.save",
					profile,
					expectedRevision,
				},
			},
		);
	}

	async applyEditorOperation(
		operation: EditorOperation,
	): Promise<EditorOperationResult> {
		const sessionId = this.requireSession();
		const result = await this.request<EditorOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/editor`,
			{ type: operation.operation, sessionId, payload: operation },
		);
		if (result.workspaceSnapshot) this.snapshot = result.workspaceSnapshot;
		return result;
	}

	async browseFs(path?: string): Promise<FsBrowseResult> {
		const query = path ? `?path=${encodeURIComponent(path)}` : "";
		return this.getRequest<FsBrowseResult>(`/api/fs/browse${query}`);
	}

	async createDirectory(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }> {
		return this.request<{ readonly path: string }>("/api/fs/directory", {
			type: "fs.createDirectory",
			sessionId: this.sessionId ?? "",
			payload: { parentPath, name },
		});
	}

	async createProjectDirectory(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }> {
		return this.request<{ readonly path: string }>("/api/project/directory", {
			type: "project.createDirectory",
			sessionId: this.requireSession(),
			payload: { parentPath, name },
		});
	}

	async getFileTree(): Promise<readonly FileTreeItemDto[]> {
		const result = await this.request<{
			readonly tree: readonly FileTreeItemDto[];
		}>("/api/project/file-tree", {
			type: "project.getFileTree",
			sessionId: this.requireSession(),
			payload: {},
		});
		return result.tree;
	}

	async createFile(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }> {
		return this.request<{ readonly path: string }>("/api/project/file", {
			type: "project.createFile",
			sessionId: this.requireSession(),
			payload: { parentPath, name },
		});
	}

	async openProject(path: string): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			snapshot: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/project`, {
			type: "project.open",
			sessionId,
			payload: { action: "open", path },
		});
		this.snapshot = payload.snapshot;
		return payload.snapshot;
	}

	async initProject(
		path: string,
		displayName?: string,
	): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			snapshot: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/project`, {
			type: "project.init",
			sessionId,
			payload: { action: "init", path, displayName },
		});
		this.snapshot = payload.snapshot;
		return payload.snapshot;
	}

	async saveAsProject(
		path: string,
		displayName?: string,
	): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			snapshot: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/project`, {
			type: "project.saveAs",
			sessionId,
			payload: { action: "saveAs", path, displayName },
		});
		this.snapshot = payload.snapshot;
		return payload.snapshot;
	}

	async closeProject(): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			snapshot: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/project`, {
			type: "project.close",
			sessionId,
			payload: { action: "close" },
		});
		this.snapshot = payload.snapshot;
		return payload.snapshot;
	}

	async getProjectConfiguration(): Promise<ProjectConfigurationDto> {
		const sessionId = this.requireSession();
		return this.request<ProjectConfigurationDto>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.getConfiguration",
				sessionId,
				payload: {
					operation: "project.getConfiguration",
					requestId: crypto.randomUUID(),
				},
			},
		);
	}

	async updateProjectConfiguration(
		configuration: ProjectConfigurationEditDto,
		expectedRevision: string,
	): Promise<ProjectOperationResult> {
		const sessionId = this.requireSession();
		const result = await this.request<ProjectOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.updateConfiguration",
				sessionId,
				payload: {
					operation: "project.updateConfiguration",
					requestId: crypto.randomUUID(),
					configuration,
					expectedRevision,
				},
			},
		);
		if (result.status === "accepted") this.snapshot = result.snapshot;
		return result;
	}

	async previewExtensionGroup(
		groupId?: string,
		extensionIds?: readonly string[],
		setActive?: boolean,
	): Promise<ProjectExtensionGroupOperationResult> {
		const sessionId = this.requireSession();
		return this.request<ProjectExtensionGroupOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.previewExtensionGroup",
				sessionId,
				payload: {
					operation: "project.previewExtensionGroup",
					requestId: crypto.randomUUID(),
					...(groupId === undefined ? {} : { groupId }),
					...(extensionIds === undefined ? {} : { extensionIds }),
					...(setActive === undefined ? {} : { setActive }),
				},
			},
		);
	}

	async updateExtensionGroup(
		patch: ProjectExtensionGroupPatch,
		expectedRevision: string,
		apply = false,
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.requestGroupOperation("project.updateExtensionGroup", {
			patch,
			expectedRevision,
			apply,
		});
	}

	async createExtensionGroup(
		group: ProjectExtensionGroupDraft,
		expectedRevision: string,
		apply = false,
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.requestGroupOperation("project.createExtensionGroup", {
			group,
			expectedRevision,
			apply,
		});
	}

	async duplicateExtensionGroup(
		sourceGroupId: string,
		expectedRevision: string,
		displayName?: string,
		groupId?: string,
		setActive?: boolean,
		apply = false,
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.requestGroupOperation("project.duplicateExtensionGroup", {
			sourceGroupId,
			expectedRevision,
			...(displayName === undefined ? {} : { displayName }),
			...(groupId === undefined ? {} : { groupId }),
			...(setActive === undefined ? {} : { setActive }),
			apply,
		});
	}

	async deleteExtensionGroup(
		groupId: string,
		expectedRevision: string,
		replacementGroupId?: string,
		clearActive?: boolean,
		apply = false,
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.requestGroupOperation("project.deleteExtensionGroup", {
			groupId,
			expectedRevision,
			...(replacementGroupId === undefined ? {} : { replacementGroupId }),
			...(clearActive === undefined ? {} : { clearActive }),
			apply,
		});
	}

	async setActiveExtensionGroup(
		groupId: string | null,
		expectedRevision: string,
		apply = false,
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.requestGroupOperation("project.setActiveExtensionGroup", {
			groupId,
			expectedRevision,
			apply,
		});
	}

	private async requestGroupOperation(
		operation:
			| "project.updateExtensionGroup"
			| "project.createExtensionGroup"
			| "project.duplicateExtensionGroup"
			| "project.deleteExtensionGroup"
			| "project.setActiveExtensionGroup",
		payload: Record<string, unknown>,
	): Promise<ProjectExtensionGroupOperationResult> {
		const sessionId = this.requireSession();
		const result = await this.request<ProjectExtensionGroupOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: operation,
				sessionId,
				payload: { operation, requestId: crypto.randomUUID(), ...payload },
			},
		);
		if (result.status === "accepted" && result.snapshot)
			this.snapshot = result.snapshot;
		return result;
	}

	async previewBackendMigration(
		target: ProjectConfigurationDto["backend"],
	): Promise<ProjectOperationResult> {
		const sessionId = this.requireSession();
		const source = (await this.getProjectConfiguration()).backend;
		return this.request<ProjectOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.previewBackendMigration",
				sessionId,
				payload: {
					operation: "project.previewBackendMigration",
					requestId: crypto.randomUUID(),
					source,
					target,
				},
			},
		);
	}

	async applyBackendMigration(
		target: ProjectConfigurationDto["backend"],
		expectedRevision: string,
	): Promise<ProjectOperationResult> {
		const sessionId = this.requireSession();
		const source = (await this.getProjectConfiguration()).backend;
		const result = await this.request<ProjectOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.applyBackendMigration",
				sessionId,
				payload: {
					operation: "project.applyBackendMigration",
					requestId: crypto.randomUUID(),
					source,
					target,
					expectedRevision,
				},
			},
		);
		if (result.status === "migrated") this.snapshot = result.snapshot;
		return result;
	}

	async getMigrationJournal(): Promise<ProjectMigrationJournalStatusDto> {
		const sessionId = this.requireSession();
		return this.request<ProjectMigrationJournalStatusDto>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.getMigrationJournal",
				sessionId,
				payload: {
					operation: "project.getMigrationJournal",
					requestId: crypto.randomUUID(),
				},
			},
		);
	}

	async recoverBackendMigration(): Promise<ProjectMigrationRecoveryResultDto> {
		const sessionId = this.requireSession();
		return this.request<ProjectMigrationRecoveryResultDto>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.recoverBackendMigration",
				sessionId,
				payload: {
					operation: "project.recoverBackendMigration",
					requestId: crypto.randomUUID(),
				},
			},
		);
	}

	async discardBackendMigration(): Promise<ProjectMigrationRecoveryResultDto> {
		const sessionId = this.requireSession();
		return this.request<ProjectMigrationRecoveryResultDto>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.discardBackendMigration",
				sessionId,
				payload: {
					operation: "project.discardBackendMigration",
					requestId: crypto.randomUUID(),
				},
			},
		);
	}

	async resumeBackendMigration(): Promise<ProjectOperationResult> {
		const sessionId = this.requireSession();
		return this.request<ProjectOperationResult>(
			`/api/sessions/${encodeURIComponent(sessionId)}/project`,
			{
				type: "project.resumeBackendMigration",
				sessionId,
				payload: {
					operation: "project.resumeBackendMigration",
					requestId: crypto.randomUUID(),
				},
			},
		);
	}

	subscribe(listener: (event: HostEvent) => void): () => void {
		this.listeners.add(listener);
		if (this.sessionId && !this.socket) this.connectSocket();
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.socket?.close();
				this.socket = undefined;
			}
		};
	}

	subscribeState(listener: (state: TransportState) => void): () => void {
		this.stateListeners.add(listener);
		listener(this.state);
		return () => this.stateListeners.delete(listener);
	}

	private connectSocket(): void {
		if (!this.sessionId || this.socket) return;
		const base = this.baseUrl || window.location.origin;
		const url = new URL(
			`/api/sessions/${encodeURIComponent(this.sessionId)}/events`,
			base,
		);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		const socket = new WebSocket(url);
		this.socket = socket;
		socket.onopen = () => this.setState("connected");
		socket.onmessage = (message) => {
			try {
				const event = JSON.parse(String(message.data)) as HostEvent;
				if (event.sessionId !== this.sessionId) return;
				const snapshot = (event.payload as { snapshot?: HostWorkspaceSnapshot })
					.snapshot;
				if (snapshot) this.snapshot = snapshot;
				for (const current of this.listeners) current(event);
			} catch {
				this.setState("error");
			}
		};
		socket.onerror = () => this.setState("error");
		socket.onclose = () => {
			this.socket = undefined;
			if (this.listeners.size > 0) {
				this.setState("reconnecting");
				void this.getSnapshot().catch(() => undefined);
				this.reconnectTimer = window.setTimeout(
					() => this.connectSocket(),
					500,
				);
			} else this.setState("disconnected");
		};
	}

	private async getRequest<T>(path: string): Promise<T> {
		return this.request<T>(path, undefined, "GET");
	}
	private async request<T>(
		path: string,
		body?: { type: string; sessionId: string; payload: unknown },
		method = "POST",
	): Promise<T> {
		const requestId = crypto.randomUUID();
		const request: HostRequest = {
			version: MACRO_PROTOCOL_VERSION,
			requestId,
			type: body?.type ?? "snapshot.get",
			sessionId: body?.sessionId ?? this.requireSession(),
			payload: body?.payload ?? {},
		};
		const url = `${this.baseUrl}${path}`;
		const response = await fetch(url, {
			method,
			headers: {
				"content-type": "application/json",
				"x-request-id": requestId,
			},
			...(method === "GET" ? {} : { body: JSON.stringify(request) }),
		});
		const envelope = (await response.json()) as HostResponse<T>;
		if (!response.ok || !envelope.ok) {
			throw new HostRequestError(
				envelope.error ?? safeHostError(response.status),
			);
		}
		return envelope.payload as T;
	}

	private requireSession(): string {
		if (!this.sessionId) throw new Error("Host session has not been created");
		return this.sessionId;
	}
	private setState(state: TransportState): void {
		this.state = state;
		for (const listener of this.stateListeners) listener(state);
	}
}
