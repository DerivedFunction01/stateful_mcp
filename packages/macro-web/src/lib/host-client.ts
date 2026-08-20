import {
	type EditorOperation,
	type EditorOperationResult,
	type HostError,
	type HostRequest,
	type HostResponse,
	type KeymapBindingContextDto,
	type KeymapBindingResolutionDto,
	MACRO_PROTOCOL_VERSION,
	type SettingsApplyResult,
	type SettingsBundleOperation,
	type SettingsBundleResult,
	type SettingsOperation,
	type SettingsUiOperation,
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
		super(error.message);
		this.name = "HostRequestError";
	}
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
	selectKeymap(profileId: string): Promise<unknown>;
	resolveBinding(
		chord: string,
		context: KeymapBindingContextDto,
	): Promise<KeymapBindingResolutionDto>;
	applySettings(operation: SettingsOperation): Promise<SettingsApplyResult>;
	applySettingsUi(operation: SettingsUiOperation): Promise<SettingsApplyResult>;
	applySettingsBundle(
		operation: SettingsBundleOperation,
	): Promise<SettingsBundleResult>;
	applyEditorOperation(
		operation: EditorOperation,
	): Promise<EditorOperationResult>;
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

	async selectKeymap(profileId: string): Promise<unknown> {
		const sessionId = this.requireSession();
		const payload = await this.request<{
			snapshot?: HostWorkspaceSnapshot;
		}>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
			type: "keymap.profile.select",
			sessionId,
			payload: { profileId },
		});
		if (payload.snapshot) this.snapshot = payload.snapshot;
		return payload.snapshot;
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
		const response = await fetch(`${this.baseUrl}${path}`, {
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
				envelope.error ?? {
					code: "HOST_REQUEST_FAILED",
					message: `Host responded with ${response.status}`,
				},
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
