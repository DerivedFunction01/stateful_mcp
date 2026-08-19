export interface HostWorkspaceSnapshot {
	readonly workspaceId: string;
	readonly sessionId: string;
	readonly profileId: string;
	readonly enabledExtensionIds: readonly string[];
	readonly activeTabId?: string;
	readonly diagnostics: readonly HostDiagnostic[];
}

export interface HostDiagnostic {
	readonly severity: "info" | "warning" | "error";
	readonly message: string;
}

export interface HostEvent {
	readonly type: "workspace.changed" | "settings.changed" | "diagnostics.changed";
	readonly snapshot: HostWorkspaceSnapshot;
}

export interface HostClient {
	getSnapshot(): Promise<HostWorkspaceSnapshot>;
	subscribe(listener: (event: HostEvent) => void): () => void;
}

export class BrowserHostClient implements HostClient {
	private readonly listeners = new Set<(event: HostEvent) => void>();
	private socket?: WebSocket;

	constructor(private readonly baseUrl = "") {}

	async getSnapshot(): Promise<HostWorkspaceSnapshot> {
		const response = await fetch(`${this.baseUrl}/api/workspace/snapshot`);
		if (!response.ok) throw new Error(`Host responded with ${response.status}`);
		return (await response.json()) as HostWorkspaceSnapshot;
	}

	subscribe(listener: (event: HostEvent) => void): () => void {
		this.listeners.add(listener);
		if (!this.socket) {
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			this.socket = new WebSocket(`${protocol}//${window.location.host}/api/workspace/events`);
			this.socket.onmessage = (event) => {
				const parsed = JSON.parse(event.data as string) as HostEvent;
				for (const current of this.listeners) current(parsed);
			};
		}
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.socket?.close();
				this.socket = undefined;
			}
		};
	}
}

export function createDiagnosticHostClient(): HostClient {
	const snapshot: HostWorkspaceSnapshot = {
		workspaceId: "sample-workspace",
		sessionId: "web-gallery-session",
		profileId: "clinical",
		enabledExtensionIds: ["notes", "measurements", "sample.runtime"],
		diagnostics: [
			{ severity: "info", message: "Fixture data; host transport is not connected" },
		],
	};
	return {
		getSnapshot: async () => snapshot,
		subscribe: () => () => undefined,
	};
}
