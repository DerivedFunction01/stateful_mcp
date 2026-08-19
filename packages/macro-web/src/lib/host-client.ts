import {
	MACRO_PROTOCOL_VERSION,
	type HostEvent as WireHostEvent,
	type HostRequest,
	type HostResponse,
	type SettingsOperation,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";

export type HostWorkspaceSnapshot = WorkspaceSnapshot;
export type HostEvent = WireHostEvent;
export type TransportState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface HostClient {
	createSession(options?: { readonly profileId?: string; readonly locale?: string; readonly initialText?: string }): Promise<HostWorkspaceSnapshot>;
	getSnapshot(): Promise<HostWorkspaceSnapshot>;
	executeCommand(command: string, args?: readonly unknown[], expectedRevision?: number): Promise<unknown>;
	applySettings(operation: SettingsOperation): Promise<HostWorkspaceSnapshot>;
	parse(text: string, textRevision: number): Promise<HostWorkspaceSnapshot>;
	subscribe(listener: (event: HostEvent) => void): () => void;
	subscribeState(listener: (state: TransportState) => void): () => void;
	getState(): TransportState;
	getSessionId(): string | undefined;
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

	getState(): TransportState { return this.state; }
	getSessionId(): string | undefined { return this.sessionId; }

	async createSession(options: { readonly profileId?: string; readonly locale?: string; readonly initialText?: string } = {}): Promise<HostWorkspaceSnapshot> {
		this.setState("connecting");
		const payload = await this.request<{
			sessionId: string;
			workspaceId: string;
			snapshot: HostWorkspaceSnapshot;
		}>("/api/sessions", { type: "session.open", sessionId: "", payload: options });
		this.sessionId = payload.sessionId;
		this.snapshot = payload.snapshot;
		this.connectSocket();
		this.setState("connected");
		return payload.snapshot;
	}

	async getSnapshot(): Promise<HostWorkspaceSnapshot> {
		if (!this.sessionId) return this.createSession();
		const payload = await this.getRequest<HostWorkspaceSnapshot>(`/api/sessions/${encodeURIComponent(this.sessionId)}/snapshot`);
		this.snapshot = payload;
		return payload;
	}

	async executeCommand(command: string, args: readonly unknown[] = [], expectedRevision?: number): Promise<unknown> {
		const sessionId = this.requireSession();
		const payload = await this.request<{ result?: unknown }>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, { type: "command.execute", sessionId, payload: { command, args, expectedRevision } });
		return payload.result;
	}

	async applySettings(operation: SettingsOperation): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const snapshot = await this.request<HostWorkspaceSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/settings`, { type: "settings.apply", sessionId, payload: operation });
		this.snapshot = snapshot;
		return snapshot;
	}

	async parse(text: string, textRevision: number): Promise<HostWorkspaceSnapshot> {
		const sessionId = this.requireSession();
		const snapshot = await this.request<HostWorkspaceSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/parse`, { type: "scratchpad.parse", sessionId, payload: { text, textRevision } });
		this.snapshot = snapshot;
		return snapshot;
	}

	subscribe(listener: (event: HostEvent) => void): () => void {
		this.listeners.add(listener);
		if (this.sessionId && !this.socket) this.connectSocket();
		return () => { this.listeners.delete(listener); if (this.listeners.size === 0) { this.socket?.close(); this.socket = undefined; } };
	}

	subscribeState(listener: (state: TransportState) => void): () => void { this.stateListeners.add(listener); listener(this.state); return () => this.stateListeners.delete(listener); }

	private connectSocket(): void {
		if (!this.sessionId || this.socket) return;
		const base = this.baseUrl || window.location.origin;
		const url = new URL(`/api/sessions/${encodeURIComponent(this.sessionId)}/events`, base);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		const socket = new WebSocket(url);
		this.socket = socket;
		socket.onopen = () => this.setState("connected");
		socket.onmessage = (message) => {
			try {
				const event = JSON.parse(String(message.data)) as HostEvent;
				if (event.sessionId !== this.sessionId) return;
				if (this.snapshot && event.sequence !== 0 && event.sequence < this.snapshot.revision) return;
				const snapshot = (event.payload as { snapshot?: HostWorkspaceSnapshot }).snapshot;
				if (snapshot) this.snapshot = snapshot;
				for (const current of this.listeners) current(event);
			} catch { this.setState("error"); }
		};
		socket.onerror = () => this.setState("error");
		socket.onclose = () => {
			this.socket = undefined;
			if (this.listeners.size > 0) {
				this.setState("reconnecting");
				this.reconnectTimer = window.setTimeout(() => this.connectSocket(), 500);
			} else this.setState("disconnected");
		};
	}

	private async getRequest<T>(path: string): Promise<T> { return this.request<T>(path, undefined, "GET"); }
	private async request<T>(path: string, body?: { type: string; sessionId: string; payload: unknown }, method = "POST"): Promise<T> {
		const requestId = crypto.randomUUID();
		const request: HostRequest = { version: MACRO_PROTOCOL_VERSION, requestId, type: body?.type ?? "snapshot.get", sessionId: body?.sessionId ?? this.requireSession(), payload: body?.payload ?? {} };
		const response = await fetch(`${this.baseUrl}${path}`, { method, headers: { "content-type": "application/json", "x-request-id": requestId }, ...(method === "GET" ? {} : { body: JSON.stringify(request) }) });
		const envelope = await response.json() as HostResponse<T>;
		if (!response.ok || !envelope.ok) throw new Error(envelope.error?.message ?? `Host responded with ${response.status}`);
		return envelope.payload as T;
	}

	private requireSession(): string { if (!this.sessionId) throw new Error("Host session has not been created"); return this.sessionId; }
	private setState(state: TransportState): void { this.state = state; for (const listener of this.stateListeners) listener(state); }
}

export function createDiagnosticHostClient(): HostClient {
	const snapshot = {
		workspaceId: "sample-workspace", sessionId: "web-gallery-session", profile: { id: "clinical", displayName: "Clinical", enabledExtensionIds: ["notes", "measurements", "sample.runtime"] }, enabledExtensionIds: ["notes", "measurements", "sample.runtime"], applications: ["notes", "measurements", "sample.runtime"].map((id) => ({ id, displayName: id })), keymap: { profileId: "default", name: "Fixture", bindings: [] }, commands: [], contributions: { tabs: [], views: [], containers: [] }, settings: { effective: {}, draft: {}, rawText: "{}", schema: [], diagnostics: [], dirty: false, activeProfileId: "clinical" }, layout: {}, scratchpad: {}, diagnostics: [{ severity: "info" as const, message: "Fixture data; host transport is not connected" }], revision: 0,
	} satisfies HostWorkspaceSnapshot;
	return {
		createSession: async () => snapshot,
		getSnapshot: async () => snapshot,
		executeCommand: async () => undefined,
		applySettings: async () => snapshot,
		parse: async () => snapshot,
		subscribe: () => () => undefined,
		subscribeState: (listener) => { listener("connected"); return () => undefined; },
		getState: () => "connected",
		getSessionId: () => snapshot.sessionId,
	};
}
